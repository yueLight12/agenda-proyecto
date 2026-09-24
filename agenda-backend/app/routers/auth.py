"""
Router de autenticación: login y datos del usuario actual.
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.rate_limit import limiter
from app.core.security import crear_access_token, hash_password, verificar_password
from app.database import get_db
from app.dependencies import obtener_usuario_actual
from app.models.correo_alterno import CorreoAlterno
from app.models.usuario import Usuario
from app.schemas.usuario import (
    CambiarPasswordRequest,
    CanjearTicketRequest,
    OlvidePasswordRequest,
    RestablecerPasswordRequest,
    TicketOut,
    Token,
    UsuarioConRolesOut,
)
from app.services import intentos_fallidos, reset_password_tokens, tickets_temporales
from app.services.email_cliente import enviar_correo
from app.services.usuarios import usuario_con_roles_a_out

router = APIRouter(prefix="/auth", tags=["Autenticación"])


@router.post("/login", response_model=Token)
@limiter.limit("10/minute")
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """
    Login con email (como username) y password.
    Compatible con el flujo estándar OAuth2PasswordBearer de FastAPI.

    Limitado a 10 intentos por minuto por IP (2026-09-15, a petición de
    Yue, pensando en el piloto con 20-30 personas expuesto públicamente) --
    ver app/core/rate_limit.py. `request: Request` es obligatorio para que
    slowapi pueda leer la IP del cliente; el decorador exige que el
    parámetro exista aunque el cuerpo de la función no lo use directo.
    """
    usuario = db.query(Usuario).filter(Usuario.email == form_data.username).first()
    if not usuario:
        # Correos alternos (2026-09-17, a petición de Yue) -- varias
        # personas del directorio real siguen usando dos dominios de
        # correo vigentes; si no hay match por el correo principal, se
        # busca si ese correo está registrado como alterno de alguna
        # cuenta. Ver app/models/correo_alterno.py.
        alterno = db.query(CorreoAlterno).filter(CorreoAlterno.email == form_data.username).first()
        if alterno:
            usuario = alterno.usuario

    if not usuario or not verificar_password(form_data.password, usuario.password_hash):
        # Se audita aparte del middleware genérico (app/main.py) porque
        # aquí sí se conoce el correo intentado -- en un login fallido
        # todavía no hay ningún token del que sacar un usuario_id.
        intentos_fallidos.registrar(
            usuario_id=usuario.id if usuario else None,
            correo_intentado=form_data.username,
            metodo="POST",
            ruta="/auth/login",
            status_code=401,
            detalle="Email o contraseña incorrectos",
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email o contraseña incorrectos",
        )
    if not usuario.activo:
        intentos_fallidos.registrar(
            usuario_id=usuario.id,
            correo_intentado=form_data.username,
            metodo="POST",
            ruta="/auth/login",
            status_code=403,
            detalle="Usuario inactivo",
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Usuario inactivo"
        )

    # ultimo_login (2026-08-21): así el sistema sabe quién nunca ha
    # entrado a la app, para el aviso por correo -- ver
    # app/services/avisos_acceso.py.
    usuario.ultimo_login = datetime.utcnow()
    db.commit()

    token = crear_access_token(data={"sub": str(usuario.id)})
    return Token(access_token=token)


@router.post("/ticket", response_model=TicketOut)
def emitir_ticket(usuario: Usuario = Depends(obtener_usuario_actual)):
    """Emite un ticket de un solo uso (60s) para canjear por una conexión de
    tiempo real (/eventos/stream) sin mandar el JWT completo en la URL --
    ver app/services/tickets_temporales.py. Requiere ya estar autenticado
    con el JWT normal (header Authorization, no la URL)."""
    return TicketOut(ticket=tickets_temporales.crear_ticket(usuario.id))


@router.post("/ticket/canjear", response_model=Token)
def canjear_ticket(datos: CanjearTicketRequest, db: Session = Depends(get_db)):
    """Canjea un ticket de un solo uso (emitido por /auth/ticket o por el
    callback de SAML) por un access_token real. Sin autenticación previa --
    el ticket ES la credencial, por eso es de un solo uso y expira rápido."""
    usuario_id = tickets_temporales.canjear_ticket(datos.ticket)
    if usuario_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Ticket inválido o expirado -- intenta iniciar sesión de nuevo.",
        )
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if usuario is None or not usuario.activo:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Ticket inválido")
    token = crear_access_token(data={"sub": str(usuario.id)})
    return Token(access_token=token)


@router.get("/me", response_model=UsuarioConRolesOut)
def obtener_perfil_actual(usuario: Usuario = Depends(obtener_usuario_actual)):
    """Devuelve los datos del usuario autenticado junto con sus roles por proyecto."""
    return usuario_con_roles_a_out(usuario)


@router.post("/cambiar-password", status_code=status.HTTP_204_NO_CONTENT)
def cambiar_password(
    datos: CambiarPasswordRequest,
    usuario: Usuario = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    """Permite al usuario autenticado cambiar su propia contraseña."""
    if not verificar_password(datos.password_actual, usuario.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La contraseña actual no es correcta",
        )
    if len(datos.password_nueva) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La nueva contraseña debe tener al menos 8 caracteres",
        )

    usuario.password_hash = hash_password(datos.password_nueva)
    db.commit()


@router.post("/olvide-password", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("5/minute")
def olvide_password(request: Request, datos: OlvidePasswordRequest, db: Session = Depends(get_db)):
    """"Recuperar contraseña" (2026-09-23, a petición de Yue: "algo rápido
    que no requiera mucho trabajo") -- reusa el envío de correo ya
    existente (app/services/email_cliente.py, SMTP ya configurado) y el
    mismo patrón de token de un solo uso que /auth/ticket (ver
    app/services/reset_password_tokens.py), solo que con un TTL de 30 min
    en vez de 60s, porque aquí la persona tiene que abrir su correo y
    volver.

    SIEMPRE responde 204, exista o no ese correo (mismo criterio de
    discreción que el resto del sistema con "no revelar qué no te toca
    ver") -- así no se puede usar este endpoint para averiguar qué correos
    están registrados. También busca en correos alternos, igual que
    /auth/login."""
    usuario = db.query(Usuario).filter(Usuario.email == datos.email).first()
    if not usuario:
        alterno = db.query(CorreoAlterno).filter(CorreoAlterno.email == datos.email).first()
        if alterno:
            usuario = alterno.usuario

    if usuario and usuario.activo:
        token = reset_password_tokens.crear_token(usuario.id)
        enlace = f"{settings.url_app}/restablecer-password?token={token}"
        enviar_correo(
            usuario.email,
            "Recupera tu contraseña -- Agenda Inteligente",
            (
                f"Hola {usuario.nombre},\n\n"
                "Alguien (con suerte tú) pidió restablecer tu contraseña. Entra a este link "
                f"en los próximos 30 minutos para poner una nueva:\n\n{enlace}\n\n"
                "Si tú no pediste esto, ignora este correo -- tu contraseña actual sigue "
                "funcionando igual."
            ),
        )


@router.post("/restablecer-password", status_code=status.HTTP_204_NO_CONTENT)
def restablecer_password(datos: RestablecerPasswordRequest, db: Session = Depends(get_db)):
    """Canjea el token de /auth/olvide-password (un solo uso, 30 min) por
    una contraseña nueva. Sin autenticación previa -- el token ES la
    credencial, por eso expira rápido y solo sirve una vez."""
    usuario_id = reset_password_tokens.canjear_token(datos.token)
    if usuario_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Este link ya no es válido -- pide uno nuevo desde \"¿Olvidaste tu contraseña?\".",
        )
    if len(datos.password_nueva) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La nueva contraseña debe tener al menos 8 caracteres",
        )
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if usuario is None or not usuario.activo:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cuenta no disponible")

    usuario.password_hash = hash_password(datos.password_nueva)
    db.commit()

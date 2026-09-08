"""
Router de gestión de usuarios.

Nota de diseño: ver/crear/editar en el directorio GLOBAL de usuarios
requiere ser N1 (dirección) en AL MENOS un tema, o ser super admin global
(`usuario.es_super_admin`, ver app.core.permissions). Un Líder (N2) NO
tiene acceso a este directorio -- solo puede administrar SU equipo, tomado
de su propia plantilla "Mi equipo" (ver GET /mi-equipo, app/routers/equipos.py),
decisión explícita de Yue el 2026-08-17. El frontend (ModalEquipo.jsx) ya
refleja esto: para un N2 el selector de "agregar miembro" sale de
GET /mi-equipo, no de este endpoint.

Para dar de alta a alguien que TODAVÍA no tiene cuenta, un N2 ya no
necesita pedirle a un N1 que la cree aquí: puede usar
POST /mi-equipo/nueva-persona (app/routers/equipos.py, decisión de Yue
2026-08-17), que crea la cuenta y la agrega a su plantilla en un solo
paso -- restringido a colaborador interno/externo (N3/N4), nunca
dirección/líder.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.permissions import requerir_super_admin
from app.core.security import hash_password
from app.database import get_db
from app.dependencies import obtener_usuario_actual
from app.models.usuario import RolEnum, Usuario
from app.models.usuario_proyecto_rol import UsuarioProyectoRol
from app.schemas.preferencia_usuario import PreferenciaUsuarioActualizar, PreferenciaUsuarioOut
from app.schemas.usuario import (
    MiTelefonoActualizar,
    UsuarioActualizar,
    UsuarioConRolesOut,
    UsuarioCrear,
    UsuarioOut,
)
from app.services import auditoria
from app.services.preferencias import actualizar_preferencias, obtener_o_crear_preferencias
from app.services.usuarios import (
    obtener_usuario_o_404,
    perfil_visible_a_out,
    usuario_visible_para,
)

router = APIRouter(prefix="/usuarios", tags=["Usuarios"])


def _es_n1_en_algun_proyecto(db: Session, usuario: Usuario) -> bool:
    return (
        db.query(UsuarioProyectoRol)
        .filter(
            UsuarioProyectoRol.usuario_id == usuario.id,
            UsuarioProyectoRol.rol == RolEnum.N1,
        )
        .first()
        is not None
    )


def _requerir_n1(db: Session, usuario: Usuario):
    if usuario.es_super_admin:
        return
    if not _es_n1_en_algun_proyecto(db, usuario):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo un usuario con rol de dirección puede realizar esta acción",
        )


@router.get("", response_model=list[UsuarioOut])
def listar_usuarios(
    db: Session = Depends(get_db), usuario: Usuario = Depends(obtener_usuario_actual)
):
    _requerir_n1(db, usuario)
    return db.query(Usuario).all()


@router.post("", response_model=UsuarioOut, status_code=status.HTTP_201_CREATED)
def crear_usuario(
    datos: UsuarioCrear,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    _requerir_n1(db, usuario)

    if db.query(Usuario).filter(Usuario.email == datos.email).first():
        raise HTTPException(status_code=400, detail="Ese email ya está registrado")

    nuevo = Usuario(
        nombre=datos.nombre,
        puesto=datos.puesto,
        email=datos.email,
        password_hash=hash_password(datos.password),
    )
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)
    auditoria.registrar(db, usuario, "crear_usuario", nuevo.id, {"nombre": nuevo.nombre, "email": nuevo.email})
    return nuevo


@router.patch("/me", response_model=UsuarioOut)
def actualizar_mi_telefono(
    datos: MiTelefonoActualizar,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """A diferencia de PATCH /usuarios/{id} (solo dirección), esta ruta la
    usa cualquier usuario para su PROPIO teléfono de WhatsApp (2026-08-24,
    ver "Mi perfil" en el frontend) -- sin _requerir_n1, cada quien es
    dueño de su propio dato de contacto."""
    usuario.telefono_whatsapp = datos.telefono_whatsapp
    db.commit()
    db.refresh(usuario)
    return usuario


@router.get("/me/preferencias", response_model=PreferenciaUsuarioOut)
def obtener_mis_preferencias(
    db: Session = Depends(get_db), usuario: Usuario = Depends(obtener_usuario_actual)
):
    """Panel "Personalizar apariencia" (2026-08-26) -- shape/theme/card_order
    del usuario actual. Si nunca las guardó, se crean con los valores por
    defecto del modelo en el primer GET."""
    return obtener_o_crear_preferencias(db, usuario)


@router.patch("/me/preferencias", response_model=PreferenciaUsuarioOut)
def actualizar_mis_preferencias(
    datos: PreferenciaUsuarioActualizar,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    return actualizar_preferencias(db, usuario, datos)


@router.get("/{usuario_id}/perfil", response_model=UsuarioConRolesOut)
def obtener_perfil_usuario(
    usuario_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """Ficha de perfil de OTRO usuario (2026-08-17, "Mi perfil" extendido
    a ver el de un subordinado, pedido de Yue) -- de solo lectura, mismos
    campos que GET /auth/me. NO usa _requerir_n1 (ese gate es para el
    directorio global) -- en cambio, usuario_visible_para replica el
    criterio de listar_equipo_visible sin depender de un tema puntual: te
    ves a ti mismo siempre, o a alguien más si eres N1/N2 (local o
    heredado) de algún tema donde esa persona participa y, si eres N2,
    la supervisas ahí localmente."""
    objetivo = obtener_usuario_o_404(db, usuario_id)
    if not usuario_visible_para(db, usuario, usuario_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes acceso al perfil de este usuario",
        )
    return perfil_visible_a_out(db, usuario, objetivo)


@router.patch("/{usuario_id}", response_model=UsuarioOut)
def actualizar_usuario(
    usuario_id: int,
    datos: UsuarioActualizar,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    _requerir_n1(db, usuario)

    objetivo = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not objetivo:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    cambios = {}
    if datos.nombre is not None:
        objetivo.nombre = datos.nombre
        cambios["nombre"] = datos.nombre
    if datos.puesto is not None:
        objetivo.puesto = datos.puesto
        cambios["puesto"] = datos.puesto
    if datos.activo is not None:
        objetivo.activo = datos.activo
        cambios["activo"] = datos.activo
    if datos.password is not None:
        objetivo.password_hash = hash_password(datos.password)
        cambios["password"] = "(cambiada)"
    if datos.telefono_whatsapp is not None:
        objetivo.telefono_whatsapp = datos.telefono_whatsapp or None
        cambios["telefono_whatsapp"] = objetivo.telefono_whatsapp
    if datos.es_super_admin is not None:
        requerir_super_admin(usuario)
        objetivo.es_super_admin = datos.es_super_admin
        cambios["es_super_admin"] = datos.es_super_admin

    db.commit()
    db.refresh(objetivo)
    if cambios:
        auditoria.registrar(db, usuario, "editar_usuario", objetivo.id, cambios)
    return objetivo


@router.delete("/{usuario_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_usuario(
    usuario_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """Eliminar de verdad (no desactivar) -- reservado a superadmin, más
    estricto que crear/editar (2026-09-07, a petición de Yue). No hay
    borrado en cascada: si el usuario ya tiene entregables, reuniones,
    notas, roles u otro historial asociado, la base de datos rechaza el
    DELETE por las llaves foráneas (ninguna tiene ON DELETE CASCADE hacia
    usuarios, salvo datos 100% privados como preferencias/pendientes
    personales/suscripciones push, que sí se van con él) -- se traduce en
    un 400 claro pidiendo desactivar en su lugar, en vez de un 500 crudo
    o, peor, borrar en cascada el trabajo de otras personas."""
    requerir_super_admin(usuario)

    if usuario_id == usuario.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No puedes eliminar tu propia cuenta",
        )

    objetivo = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not objetivo:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    # Se guardan nombre/email ANTES de borrar -- el registro de auditoría
    # de abajo necesita poder decir quién era, y tras el commit del
    # DELETE ya no hay fila en `usuarios` de donde leerlos.
    nombre_borrado, email_borrado = objetivo.nombre, objetivo.email

    try:
        db.delete(objetivo)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "No se puede eliminar: este usuario ya tiene tareas, reuniones, notas u otro "
                "historial asociado. Desactívalo en su lugar para conservar ese historial."
            ),
        )
    auditoria.registrar(
        db, usuario, "eliminar_usuario", usuario_id, {"nombre": nombre_borrado, "email": email_borrado}
    )

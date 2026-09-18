"""
Login corporativo vía SAML 2.0 (2026-09-15) -- ver el comentario largo en
app/services/saml_sso.py y app/core/config.py::saml_sp_entity_id para el
porqué y el diseño general (segunda puerta de entrada, no reemplaza
/auth/login).

Flujo completo:
1. El frontend manda al navegador a GET /saml/login.
2. Este redirige al navegador al IdP (Okta) para que la persona inicie
   sesión con SUS credenciales corporativas -- esta app nunca ve esa
   contraseña.
3. El IdP redirige de vuelta el navegador con un POST a /saml/acs,
   firmado -- se valida esa firma antes de confiar en nada.
4. Si la persona ya tiene cuenta en el sistema (mismo email), se le redirige
   al frontend con un TICKET de un solo uso (no el JWT completo -- 2026-09-19,
   hallazgo de seguridad: un JWT válido por horas quedaba en el historial
   del navegador y en logs de acceso al viajar en esta URL; el ticket expira
   en segundos y solo sirve para canjearse una vez por el access_token real
   vía POST /auth/ticket/canjear, ver app/services/tickets_temporales.py).
   Si no tiene cuenta, se rechaza -- NO se auto-crea una cuenta nueva solo
   porque alguien tenga sesión en el IdP corporativo (decisión deliberada:
   evita que cualquiera con cuenta en el tenant de Okta pueda entrar,
   aunque nunca se le haya dado de alta aquí).
"""
import logging
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse, Response
from sqlalchemy.orm import Session

from app.core.config import settings
from app.database import get_db
from app.models.usuario import Usuario
from app.services import tickets_temporales
from app.services.saml_sso import (
    configurado,
    construir_url_login,
    obtener_metadata,
    procesar_respuesta_acs,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/saml", tags=["SSO corporativo (SAML)"])


def _requerir_configurado():
    if not configurado():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="El login corporativo (SSO) todavía no está configurado.",
        )


@router.get("/metadata")
def metadata():
    """Metadatos de esta app para dar de alta el Service Provider del lado
    del IdP (Okta) -- URL pública, sin autenticación (es información
    pública por diseño del estándar SAML, igual que un certificado
    HTTPS)."""
    _requerir_configurado()
    return Response(content=obtener_metadata(), media_type="application/xml")


@router.get("/login")
async def login(request: Request):
    _requerir_configurado()
    url = await construir_url_login(request)
    return RedirectResponse(url)


@router.post("/acs")
async def acs(request: Request, db: Session = Depends(get_db)):
    _requerir_configurado()
    email = await procesar_respuesta_acs(request)

    usuario = db.query(Usuario).filter(Usuario.email == email).first()
    if not usuario or not usuario.activo:
        logger.warning("Login SSO rechazado: %s no tiene cuenta activa en el sistema", email)
        # Discreción: mismo criterio que el resto del sistema (ver
        # whatsapp_webhook.py) -- no revela si el correo existe o no.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tu cuenta de la organización no tiene acceso a esta aplicación.",
        )

    ticket = tickets_temporales.crear_ticket(usuario.id)
    destino = f"{settings.url_app}/sso/callback?ticket={quote(ticket)}"
    return RedirectResponse(destino, status_code=status.HTTP_303_SEE_OTHER)

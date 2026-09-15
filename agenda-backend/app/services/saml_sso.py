"""
Login corporativo vía SAML 2.0 (2026-09-15, a petición de Yue) -- capa
delgada sobre `python3-saml` (OneLogin), que hace el trabajo pesado
(construir/firmar el AuthnRequest, validar la firma XML de la respuesta
del IdP). Este módulo solo arma la configuración a partir de `settings` y
adapta el objeto `Request` de FastAPI al diccionario que la librería
espera (piensa en Flask/Django, no en FastAPI).

Deliberadamente NO reemplaza /auth/login (email + contraseña, ver
app/routers/auth.py) -- es una SEGUNDA puerta de entrada opcional. Ver el
comentario largo en app/core/config.py::saml_sp_entity_id para el porqué
de construir esto antes de tener el certificado real.

Mientras `settings.saml_sp_entity_id` (o cualquier otro valor requerido)
esté vacío, `configurado()` devuelve False y el router responde 503 en
vez de fallar feo -- mismo patrón que WhatsApp/SMTP/VAPID cuando faltan
credenciales.
"""
from pathlib import Path

from fastapi import HTTPException, Request, status
from onelogin.saml2.auth import OneLogin_Saml2_Auth
from onelogin.saml2.settings import OneLogin_Saml2_Settings

from app.core.config import settings


def configurado() -> bool:
    return bool(
        settings.saml_sp_entity_id
        and settings.saml_sp_acs_url
        and settings.saml_idp_entity_id
        and settings.saml_idp_sso_url
        and settings.saml_idp_cert_path
    )


def _leer_archivo(ruta: str) -> str:
    contenido = Path(ruta).read_text(encoding="utf-8")
    # Los certificados/llaves PEM traen encabezado/pie ("-----BEGIN...")
    # que OneLogin_Saml2_Settings espera SIN -- solo el contenido base64
    # entre medio, tal como arma su propio "settings" internamente.
    lineas = [l for l in contenido.splitlines() if l and "-----" not in l]
    return "".join(lineas)


def _configuracion_saml() -> dict:
    if not configurado():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="El login corporativo (SSO) todavía no está configurado.",
        )

    sp = {
        "entityId": settings.saml_sp_entity_id,
        "assertionConsumerService": {
            "url": settings.saml_sp_acs_url,
            "binding": "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
        },
        "NameIDFormat": "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
        "x509cert": "",
        "privateKey": "",
    }
    if settings.saml_sp_cert_path:
        sp["x509cert"] = _leer_archivo(settings.saml_sp_cert_path)
    if settings.saml_sp_key_path:
        sp["privateKey"] = _leer_archivo(settings.saml_sp_key_path)

    return {
        "strict": True,
        "debug": False,
        "sp": sp,
        "idp": {
            "entityId": settings.saml_idp_entity_id,
            "singleSignOnService": {
                "url": settings.saml_idp_sso_url,
                "binding": "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
            },
            "x509cert": _leer_archivo(settings.saml_idp_cert_path),
        },
    }


async def _request_saml(request: Request) -> dict:
    """Adapta el Request de FastAPI al diccionario que python3-saml espera
    (piensa en Flask/Django) -- ver la guía de bajo nivel del propio
    paquete. `post_data` se llena solo en el ACS (POST); en /saml/login
    (GET) se manda vacío."""
    form = {}
    if request.method == "POST":
        datos_formulario = await request.form()
        form = {clave: valor for clave, valor in datos_formulario.items()}

    return {
        "https": "on" if request.url.scheme == "https" else "off",
        "http_host": request.url.hostname,
        "server_port": request.url.port or (443 if request.url.scheme == "https" else 80),
        "script_name": request.url.path,
        "get_data": dict(request.query_params),
        "post_data": form,
    }


async def _auth(request: Request) -> OneLogin_Saml2_Auth:
    req = await _request_saml(request)
    return OneLogin_Saml2_Auth(req, _configuracion_saml())


async def construir_url_login(request: Request) -> str:
    """URL a la que hay que redirigir al navegador para iniciar el login
    en el IdP (Okta) -- flujo "SP-initiated"."""
    auth = await _auth(request)
    return auth.login()


def obtener_metadata() -> str:
    """XML de metadatos de esta app (Service Provider) -- lo que quien
    administra Okta necesita para dar de alta la aplicación del lado del
    IdP (Entity ID, URL del ACS, certificado)."""
    configuracion = OneLogin_Saml2_Settings(settings=_configuracion_saml(), sp_validation_only=True)
    metadata = configuracion.get_sp_metadata()
    errores = configuracion.validate_metadata(metadata)
    if errores:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Metadatos SAML inválidos: {', '.join(errores)}",
        )
    return metadata


async def procesar_respuesta_acs(request: Request) -> str:
    """Valida la respuesta SAML que mandó el IdP (firma, audiencia,
    vigencia) y devuelve el email de la persona (NameID). Lanza
    HTTPException 401 con un mensaje genérico si algo no cuadra -- nunca
    hay que confiar en una respuesta que no pasó esta validación."""
    auth = await _auth(request)
    auth.process_response()

    errores = auth.get_errors()
    if errores:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"No se pudo validar la respuesta de SSO: {auth.get_last_error_reason() or errores}",
        )
    if not auth.is_authenticated():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="SSO no autenticó la sesión.")

    email = auth.get_nameid()
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="La respuesta de SSO no incluyó un correo (NameID).",
        )
    return email

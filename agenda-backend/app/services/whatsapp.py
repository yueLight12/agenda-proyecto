"""
Cliente de envío de notificaciones fuera de la app vía Twilio (2026-08-24, a
petición de Yue: alcanzar también a quien hoy usa WhatsApp/SMS y es
renuente a instalar la app -- mismo motivo que Web Push, pero para gente
que ni siquiera abre el navegador).

Canal SMS (2026-09-01, a petición de Yue) -- antes mandaba por WhatsApp
Sandbox, pero ese sandbox SIEMPRE exige que el destinatario mande primero
"join <código>" a un número que no conoce, inviable para una demo ante
gente de alto perfil que no debe hacer nada antes de recibir el mensaje.
El sandbox de WhatsApp no tiene forma de quitar ese requisito sin dar de
alta un número de WhatsApp Business real vía Meta (trámite de negocio, no
de código, ver CLAUDE.md sección 6) -- SMS con un número Twilio normal
(TWILIO_SMS_FROM) no lo requiere. El nombre de la función/el campo
Usuario.telefono_whatsapp se conservan tal cual para no romper el resto
del código que ya los usa, aunque ahora el envío real es por SMS.

Canal Ultramsg (2026-09-02, a petición de Yue) -- SOLO para una demo
puntual donde el mensaje necesita verse literalmente como WhatsApp (no
SMS), sin "join" del sandbox. Ultramsg NO es la API oficial de WhatsApp
Business -- ver el comentario largo en app/core/config.py::ultramsg_*.
Controlado por settings.whatsapp_proveedor ("sms" default / "ultramsg"),
para poder revertir a SMS en cuanto termine la demo sin tocar código.

Mientras no se configuren las credenciales del proveedor activo, el envío
se SIMULA igual que en app/services/email_cliente.py y app/services/push.py
-- mismo motivo: no bloquear el resto del sistema a que exista ya la
cuenta real.
"""
import logging

import requests
from sqlalchemy.orm import Session
from twilio.base.exceptions import TwilioRestException
from twilio.rest import Client

from app.core.config import settings
from app.models.usuario import Usuario
from app.services import configuracion

logger = logging.getLogger(__name__)


def _enviar_sms_twilio(usuario_id: int, numero: str, mensaje: str) -> None:
    if not settings.twilio_account_sid or not settings.twilio_auth_token or not settings.twilio_sms_from:
        logger.warning(
            "Twilio no configurado -- SMS SIMULADO a usuario %s (%s): %s",
            usuario_id,
            numero,
            mensaje,
        )
        return
    try:
        cliente = Client(settings.twilio_account_sid, settings.twilio_auth_token)
        cliente.messages.create(from_=settings.twilio_sms_from, to=numero, body=mensaje)
    except TwilioRestException:
        logger.exception("Fallo enviando SMS a usuario %s", usuario_id)
    except Exception:
        logger.exception("Fallo enviando SMS a usuario %s", usuario_id)


def _enviar_whatsapp_ultramsg(usuario_id: int, numero: str, mensaje: str) -> None:
    if not settings.ultramsg_instance_id or not settings.ultramsg_token:
        logger.warning(
            "Ultramsg no configurado -- WhatsApp SIMULADO a usuario %s (%s): %s",
            usuario_id,
            numero,
            mensaje,
        )
        return
    try:
        respuesta = requests.post(
            f"https://api.ultramsg.com/{settings.ultramsg_instance_id}/messages/chat",
            json={"token": settings.ultramsg_token, "to": numero, "body": mensaje},
            timeout=15,
        )
        respuesta.raise_for_status()
    except requests.RequestException:
        logger.exception("Fallo enviando WhatsApp (Ultramsg) a usuario %s", usuario_id)


def enviar_whatsapp(db: Session, usuario_id: int, mensaje: str) -> None:
    """
    Manda `mensaje` al usuario por el canal configurado (2026-09-07: ahora
    un superadmin puede cambiarlo en caliente desde el panel -- ver
    app/services/configuracion.py; `settings.whatsapp_proveedor` sigue
    siendo el default de `.env` mientras nadie lo haya tocado ahí), si
    tiene `telefono_whatsapp` configurado. Nunca lanza excepción -- un
    fallo de notificación no debe romper la operación real (crear/
    reasignar un entregable) que lo disparó.
    """
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not usuario or not usuario.telefono_whatsapp:
        return

    if configuracion.obtener(db, "whatsapp_proveedor") == "ultramsg":
        _enviar_whatsapp_ultramsg(usuario_id, usuario.telefono_whatsapp, mensaje)
    else:
        _enviar_sms_twilio(usuario_id, usuario.telefono_whatsapp, mensaje)

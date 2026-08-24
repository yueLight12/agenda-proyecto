"""
Cliente de envío de notificaciones por WhatsApp (2026-08-24, a petición de
Yue: alcanzar también a quien hoy usa WhatsApp y es renuente a instalar la
app -- mismo motivo que Web Push, pero para gente que ni siquiera abre el
navegador).

DEMO vía Twilio WhatsApp Sandbox -- NO es la WhatsApp Business API
definitiva (esa requiere permisos de TI, pendiente, ver CLAUDE.md sección
6). Cada destinatario debe unirse UNA vez al sandbox mandando el código
"join <palabra-palabra>" desde su WhatsApp al número sandbox de Twilio.

Mientras no se configuren TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN, el envío se
SIMULA igual que en app/services/email_cliente.py y app/services/push.py --
mismo motivo: no bloquear el resto del sistema a que exista ya la cuenta
Twilio real.
"""
import logging

from sqlalchemy.orm import Session
from twilio.base.exceptions import TwilioRestException
from twilio.rest import Client

from app.core.config import settings
from app.models.usuario import Usuario

logger = logging.getLogger(__name__)


def enviar_whatsapp(db: Session, usuario_id: int, mensaje: str) -> None:
    """
    Manda `mensaje` por WhatsApp al usuario, si tiene
    `telefono_whatsapp` configurado. Nunca lanza excepción -- un fallo de
    WhatsApp no debe romper la operación real (crear/reasignar un
    entregable) que lo disparó.
    """
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not usuario or not usuario.telefono_whatsapp:
        return

    if not settings.twilio_account_sid or not settings.twilio_auth_token:
        logger.warning(
            "Twilio no configurado -- WhatsApp SIMULADO a usuario %s (%s): %s",
            usuario_id,
            usuario.telefono_whatsapp,
            mensaje,
        )
        return

    try:
        cliente = Client(settings.twilio_account_sid, settings.twilio_auth_token)
        cliente.messages.create(
            from_=settings.twilio_whatsapp_from,
            to=f"whatsapp:{usuario.telefono_whatsapp}",
            body=mensaje,
        )
    except TwilioRestException:
        logger.exception("Fallo enviando WhatsApp a usuario %s", usuario_id)
    except Exception:
        logger.exception("Fallo enviando WhatsApp a usuario %s", usuario_id)

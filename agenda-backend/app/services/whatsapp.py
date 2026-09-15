"""
Cliente de envío de notificaciones fuera de la app vía WhatsApp (Ultramsg).

Historial (2026-08-24 -> 2026-09-15): empezó como WhatsApp Sandbox de
Twilio, luego SMS de Twilio (el sandbox exigía "join" antes de recibir
nada), luego Ultramsg para una demo puntual que necesitaba verse como
WhatsApp real. Twilio se descartó del todo el 2026-09-15 (a petición de
Yue, ya con Ultramsg validado como canal principal) -- ver
app/routers/whatsapp_webhook.py para lo que se perdió con eso (crear
tareas por nota de voz en WhatsApp, exclusivo de Twilio).

Ultramsg NO es la API oficial de WhatsApp Business -- automatiza WhatsApp
Web (login por QR desde un teléfono), va contra los términos de servicio
de WhatsApp y el número se puede bloquear sin aviso con uso real/sostenido.
Aceptado explícitamente por Yue como solución mientras se resuelve WhatsApp
Business real (ver CLAUDE.md).

Mientras no se configuren las credenciales, el envío se SIMULA igual que
en app/services/email_cliente.py y app/services/push.py -- mismo motivo:
no bloquear el resto del sistema a que exista ya la cuenta real.
"""
import logging

import requests
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.usuario import Usuario

logger = logging.getLogger(__name__)


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
    Manda `mensaje` al usuario por WhatsApp (Ultramsg), si tiene
    `telefono_whatsapp` configurado. Nunca lanza excepción -- un fallo de
    notificación no debe romper la operación real (crear/reasignar un
    entregable, recordatorio) que lo disparó.
    """
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not usuario or not usuario.telefono_whatsapp:
        return

    _enviar_whatsapp_ultramsg(usuario_id, usuario.telefono_whatsapp, mensaje)

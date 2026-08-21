"""
Cliente de envío de correo, vía SMTP de Outlook/Office 365 (2026-08-21, a
petición de Yue: obligar a que todos en la organización usen el sistema,
avisando por correo a quien nunca ha entrado -- ver
app/services/avisos_acceso.py, que es quien decide CUÁNDO mandar el
correo; este módulo solo sabe CÓMO mandarlo).

Mientras no se configuren `SMTP_USUARIO`/`SMTP_PASSWORD` (variables de
entorno reales, ver .env.example), el envío se SIMULA: se registra en el
log en vez de intentar conectar a un servidor SMTP sin credenciales. Esto
es intencional -- permite que el resto del sistema (detección de "nunca ha
entrado", el disparador al asignar una tarea) se construya y prueba de
inmediato sin bloquear todo a que exista ya la cuenta remitente real.
"""
import logging
import smtplib
from email.message import EmailMessage

from app.core.config import settings

logger = logging.getLogger(__name__)


def enviar_correo(destinatario_email: str, asunto: str, cuerpo_texto: str) -> bool:
    """
    Manda un correo de texto plano. Devuelve True si se envió (o se
    simuló), False si hubo un error real de conexión/autenticación --
    nunca lanza una excepción, para que un fallo de correo no tumbe la
    operación real (crear/reasignar un entregable) que lo disparó.
    """
    if not settings.smtp_usuario or not settings.smtp_password:
        logger.warning(
            "SMTP no configurado (SMTP_USUARIO/SMTP_PASSWORD vacíos) -- "
            "correo SIMULADO a %s: [%s] %s",
            destinatario_email,
            asunto,
            cuerpo_texto,
        )
        return True

    mensaje = EmailMessage()
    mensaje["Subject"] = asunto
    mensaje["From"] = f"{settings.smtp_nombre_remitente} <{settings.smtp_usuario}>"
    mensaje["To"] = destinatario_email
    mensaje.set_content(cuerpo_texto)

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_puerto, timeout=10) as servidor:
            servidor.starttls()
            servidor.login(settings.smtp_usuario, settings.smtp_password)
            servidor.send_message(mensaje)
        return True
    except Exception:
        logger.exception("No se pudo enviar el correo a %s", destinatario_email)
        return False

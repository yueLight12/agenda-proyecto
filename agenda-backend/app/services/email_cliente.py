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

2026-08-24: se intentaron dos vías para mandar desde el Outlook
corporativo de Yue sin depender de la contraseña de aplicación de Gmail:
- Power Automate Cloud (trigger HTTP + "Send an email (V2)" de Office 365
  Outlook): el conector falló al conectar ("Failed to create OAuth
  connection: Connection not found") -- bloqueado por política de la
  organización, pendiente de que TI lo habilite.
- Power Automate Desktop (Outlook de escritorio + flujo que consulta una
  bandeja de salida en la BD): Outlook de escritorio presentó un problema
  propio en la laptop de Yue que impidió terminar la prueba.
Ambos quedaron pausados por decisión de Yue; se vuelve a este envío
directo por SMTP. El código de ambos intentos se deja comentado al final
de este archivo, listo para retomar.
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


# --- INACTIVO desde 2026-08-24: envío vía Power Automate Cloud ------------
# Bloqueado por política de la organización sobre el conector Office 365
# Outlook. Se deja el código completo por si TI habilita el conector más
# adelante -- requeriría reactivar power_automate_webhook_url_correo en
# app/core/config.py.
#
# import requests
#
# def enviar_correo_power_automate(destinatario_email: str, asunto: str, cuerpo_texto: str) -> bool:
#     if not settings.power_automate_webhook_url_correo:
#         logger.warning(
#             "Power Automate no configurado (POWER_AUTOMATE_WEBHOOK_URL_CORREO "
#             "vacío) -- correo SIMULADO a %s: [%s] %s",
#             destinatario_email, asunto, cuerpo_texto,
#         )
#         return True
#
#     try:
#         respuesta = requests.post(
#             settings.power_automate_webhook_url_correo,
#             json={
#                 "destinatario_email": destinatario_email,
#                 "asunto": asunto,
#                 "cuerpo_texto": cuerpo_texto,
#             },
#             timeout=15,
#         )
#         respuesta.raise_for_status()
#         return True
#     except Exception:
#         logger.exception("No se pudo enviar el correo a %s vía Power Automate", destinatario_email)
#         return False


# --- INACTIVO desde 2026-08-24: envío vía Power Automate Desktop ----------
# Encola el correo en la tabla `correos_pendientes` (ver
# app/models/correo_pendiente.py) para que un flujo de escritorio en la
# laptop de Yue, con Outlook abierto, lo consulte y lo mande desde ahí (ver
# app/routers/integraciones.py). Pausado por un problema de Outlook de
# escritorio en la laptop de Yue antes de terminar la prueba -- el modelo,
# la migración y el router de integración quedan en el repo, sin usarse.
#
# from app.database import SessionLocal
# from app.models.correo_pendiente import CorreoPendiente
#
# def enviar_correo_bandeja_salida(destinatario_email: str, asunto: str, cuerpo_texto: str) -> bool:
#     db = SessionLocal()
#     try:
#         db.add(
#             CorreoPendiente(
#                 destinatario_email=destinatario_email,
#                 asunto=asunto,
#                 cuerpo_texto=cuerpo_texto,
#             )
#         )
#         db.commit()
#         return True
#     except Exception:
#         logger.exception("No se pudo encolar el correo a %s", destinatario_email)
#         db.rollback()
#         return False
#     finally:
#         db.close()

"""
Cliente de envío de notificaciones push del navegador (Web Push, VAPID)
(2026-08-23, a petición de Yue: un entregable urgente debe poder avisar al
responsable aunque tenga el celular con la pantalla apagada o la app
cerrada -- la notificación in-app por sí sola no lo logra).

Mientras no se configuren VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY (ver
.env.example), el envío se SIMULA igual que en app/services/email_cliente.py
-- mismo motivo: no bloquear el resto del sistema a que existan ya las
llaves reales.
"""
import logging

from pywebpush import WebPushException, webpush
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.suscripcion_push import SuscripcionPush

logger = logging.getLogger(__name__)


def enviar_push(db: Session, usuario_id: int, titulo: str, cuerpo: str, url: str | None = None) -> None:
    """
    Manda una notificación push a TODAS las suscripciones activas del
    usuario (uno por navegador/dispositivo donde haya activado
    notificaciones). Nunca lanza excepción -- un fallo de push no debe
    romper la operación real (crear/reasignar un entregable) que lo
    disparó. Borra en el momento las suscripciones que el navegador
    reporta como caducadas/inválidas (404/410), para no reintentar contra
    algo que ya no existe.
    """
    suscripciones = (
        db.query(SuscripcionPush).filter(SuscripcionPush.usuario_id == usuario_id).all()
    )
    if not suscripciones:
        return

    if not settings.vapid_public_key or not settings.vapid_private_key:
        logger.warning(
            "VAPID no configurado -- push SIMULADO a usuario %s: [%s] %s",
            usuario_id,
            titulo,
            cuerpo,
        )
        return

    payload = {"titulo": titulo, "cuerpo": cuerpo, "url": url}
    vapid_claims = {"sub": f"mailto:{settings.vapid_contact_email}"}

    for suscripcion in suscripciones:
        try:
            webpush(
                subscription_info={
                    "endpoint": suscripcion.endpoint,
                    "keys": {"p256dh": suscripcion.p256dh, "auth": suscripcion.auth},
                },
                data=_serializar(payload),
                vapid_private_key=settings.vapid_private_key,
                vapid_claims=dict(vapid_claims),
            )
        except WebPushException as error:
            respuesta = getattr(error, "response", None)
            if respuesta is not None and respuesta.status_code in (404, 410):
                db.delete(suscripcion)
            else:
                logger.exception("Fallo enviando push a usuario %s", usuario_id)
        except Exception:
            logger.exception("Fallo enviando push a usuario %s", usuario_id)


def _serializar(payload: dict) -> str:
    import json

    return json.dumps(payload, ensure_ascii=False)

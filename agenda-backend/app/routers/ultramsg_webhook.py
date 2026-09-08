"""
Webhook entrante de Ultramsg -- SOLO para la demo puntual de WhatsApp real
(2026-09-02, a petición de Yue, ver app/core/config.py::ultramsg_* y
app/services/whatsapp.py). NO es un canal de producción -- Ultramsg no es
la API oficial de WhatsApp Business.

Reusa el mismo núcleo que ya usa el webhook de Twilio
(procesar_mensaje_whatsapp en app/routers/whatsapp_webhook.py) -- la única
diferencia real es la forma del payload entrante y cómo se contesta:
Twilio acepta TwiML como respuesta HTTP (el mismo POST ya es la
contestación), Ultramsg NO -- hay que llamarle de vuelta a su API de envío
para contestar.

Payload real confirmado (2026-09-02, la documentación pública de Ultramsg
no lo especifica, se capturó con un webhook de depuración antes de escribir
esto):
{
  "event_type": "message_received",
  "instanceId": "...",
  "data": {
    "from": "5217561019511@c.us",   # sin "+", con sufijo @c.us
    "to": "5217352212759@c.us",
    "body": "LISTO",
    "type": "chat",
    "fromMe": false,
    ...
  }
}

Seguridad: a diferencia de Twilio (X-Twilio-Signature), Ultramsg NO firma
sus peticiones -- como defensa mínima, la URL del webhook incluye un
segmento secreto (ultramsg_webhook_secreto) que se valida antes de
procesar nada. Aceptado como riesgo residual de una integración desechable
solo para demo, ver docstring de app/core/config.py::ultramsg_webhook_secreto.
"""
import logging

import requests
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.config import settings
from app.database import get_db
from app.routers.whatsapp_webhook import procesar_mensaje_whatsapp

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks/ultramsg", tags=["Webhook Ultramsg (demo)"])


def _normalizar_numero(numero_ultramsg: str) -> str:
    """"5217561019511@c.us" -> "+527561019511" (mismo formato E.164 que
    usa Usuario.telefono_whatsapp en el resto del sistema).

    Bug real encontrado probando esto (2026-09-02): WhatsApp mete un "1"
    extra en su JID interno para celulares de México
    ("521" + 10 dígitos = 13 dígitos) que NO aparece en el formato E.164
    "humano" que ya usa el resto del sistema ("52" + 10 dígitos = 12
    dígitos) -- sin quitarlo, nunca calza contra Usuario.telefono_whatsapp
    y el mensaje se descarta en silencio como "número sin usuario"."""
    numero = "+" + numero_ultramsg.split("@")[0]
    if numero.startswith("+521") and len(numero) == 14:  # "+521" + 10 dígitos
        numero = "+52" + numero[4:]
    return numero


def _responder_ultramsg(numero_destino: str, mensaje: str) -> None:
    if not settings.ultramsg_instance_id or not settings.ultramsg_token:
        logger.warning("Ultramsg no configurado -- respuesta SIMULADA a %s: %s", numero_destino, mensaje)
        return
    try:
        respuesta = requests.post(
            f"https://api.ultramsg.com/{settings.ultramsg_instance_id}/messages/chat",
            json={"token": settings.ultramsg_token, "to": numero_destino, "body": mensaje},
            timeout=15,
        )
        respuesta.raise_for_status()
    except requests.RequestException:
        logger.exception("Fallo respondiendo por Ultramsg a %s", numero_destino)


@router.post("/{secreto}")
async def ultramsg_entrante(secreto: str, request: Request, db: Session = Depends(get_db)):
    if not settings.ultramsg_webhook_secreto or secreto != settings.ultramsg_webhook_secreto:
        raise HTTPException(status_code=404)

    payload = await request.json()
    if payload.get("event_type") != "message_received":
        return {"ok": True}

    data = payload.get("data") or {}
    if data.get("fromMe") or data.get("type") != "chat":
        return {"ok": True}

    numero = _normalizar_numero(data.get("from", ""))
    texto = (data.get("body") or "").strip()
    if not numero or not texto:
        return {"ok": True}

    respuesta = procesar_mensaje_whatsapp(db, numero, texto)
    if respuesta:
        _responder_ultramsg(numero, respuesta)
    return {"ok": True}

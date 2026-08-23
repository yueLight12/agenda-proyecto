"""
Esquemas Pydantic: suscripción a notificaciones push del navegador.
"""
from pydantic import BaseModel


class SuscripcionPushCrear(BaseModel):
    endpoint: str
    p256dh: str
    auth: str


class SuscripcionPushEliminar(BaseModel):
    endpoint: str

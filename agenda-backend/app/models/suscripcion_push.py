"""
Suscripción de notificaciones push del navegador (Web Push, VAPID), para
poder avisar a un usuario aunque tenga la app cerrada o el celular con la
pantalla apagada (2026-08-23, a petición de Yue: los entregables urgentes
necesitan notificar FUERA de la app, no solo dentro).

Un mismo usuario puede tener varias filas (una por navegador/dispositivo
en el que activó notificaciones) -- se manda el push a todas. Ver
app/services/push.py, que es quien las usa para enviar.
"""
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String

from app.database import Base


class SuscripcionPush(Base):
    __tablename__ = "suscripciones_push"

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False)
    # Los 3 campos que entrega PushSubscription.toJSON() en el navegador --
    # endpoint identifica el dispositivo/navegador de forma única (se usa
    # también para no duplicar la misma suscripción dos veces).
    endpoint = Column(String(500), unique=True, nullable=False, index=True)
    p256dh = Column(String(255), nullable=False)
    auth = Column(String(255), nullable=False)
    fecha_creacion = Column(DateTime, default=datetime.utcnow, nullable=False)

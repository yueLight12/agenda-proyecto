"""
Modelo de Notificación (recordatorios in-app).
"""
import enum
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Enum, ForeignKey, Integer, String

from app.database import Base


class TipoNotificacion(str, enum.Enum):
    recordatorio_proximo = "recordatorio_proximo"
    recordatorio_vencido = "recordatorio_vencido"
    entregable_asignado = "entregable_asignado"
    avance_actualizado = "avance_actualizado"
    otro = "otro"


class Notificacion(Base):
    __tablename__ = "notificaciones"

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    entregable_id = Column(Integer, ForeignKey("entregables.id"), nullable=True)
    evento_empresa_id = Column(Integer, ForeignKey("eventos_empresa.id"), nullable=True)
    tipo = Column(Enum(TipoNotificacion), default=TipoNotificacion.otro, nullable=False)
    mensaje = Column(String(500), nullable=False)
    leida = Column(Boolean, default=False, nullable=False)
    fecha_creacion = Column(DateTime, default=datetime.utcnow, nullable=False)

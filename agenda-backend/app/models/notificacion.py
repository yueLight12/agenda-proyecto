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
    reunion_hoy = "reunion_hoy"
    # Recordatorio con antelación configurable (2026-08-25), distinto de
    # reunion_hoy (ese es fijo, "el mismo día") -- ver Reunion.recordatorio_minutos_antes.
    recordatorio_reunion = "recordatorio_reunion"
    otro = "otro"


class Notificacion(Base):
    __tablename__ = "notificaciones"

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    entregable_id = Column(Integer, ForeignKey("entregables.id"), nullable=True)
    evento_empresa_id = Column(Integer, ForeignKey("eventos_empresa.id"), nullable=True)
    reunion_id = Column(Integer, ForeignKey("reuniones.id"), nullable=True)
    tipo = Column(Enum(TipoNotificacion), default=TipoNotificacion.otro, nullable=False)
    mensaje = Column(String(500), nullable=False)
    leida = Column(Boolean, default=False, nullable=False)
    # Cuándo se marcó como leída (2026-09-17, "acuse de vista" de tareas
    # asignadas, a petición de Yue) -- nulo mientras `leida` sea False.
    # Solo se llena en la marcada REAL desde la campanita (ver PATCH
    # /notificaciones/{id}); el barrido automático que expira recordatorios
    # viejos (expirar_recordatorios_reuniones_hoy) deja esto en None a
    # propósito -- ese "leída" es forzado por el sistema, no porque la
    # persona de verdad la haya visto.
    fecha_leida = Column(DateTime, nullable=True)
    fecha_creacion = Column(DateTime, default=datetime.utcnow, nullable=False)
    # Urgencia (2026-08-20, a petición del cliente: la notificación de una
    # asignación urgente debe destacarse -- "lo primero que se ve") -- se
    # copia del entregable al momento de crear la notificación (no se
    # recalcula después), para que una notificación ya generada no cambie
    # de peso visual si el entregable deja de ser urgente más tarde.
    urgente = Column(Boolean, default=False, nullable=False)

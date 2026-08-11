"""
Modelo de Entregable.
"""
import enum
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from app.database import Base


class EstatusEntregable(str, enum.Enum):
    pendiente = "pendiente"
    en_progreso = "en_progreso"
    cumplido = "cumplido"


class Entregable(Base):
    __tablename__ = "entregables"

    id = Column(Integer, primary_key=True, index=True)
    proyecto_id = Column(Integer, ForeignKey("proyectos.id"), nullable=False)
    nombre = Column(String(200), nullable=False)
    descripcion = Column(Text, nullable=True)
    responsable_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    fecha_entrega = Column(Date, nullable=False)
    porcentaje_avance = Column(Integer, default=0, nullable=False)
    estatus = Column(
        Enum(EstatusEntregable), default=EstatusEntregable.pendiente, nullable=False
    )
    sensible = Column(Boolean, default=False, nullable=False)
    creado_por = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    fecha_creacion = Column(DateTime, default=datetime.utcnow, nullable=False)

    proyecto = relationship("Proyecto", back_populates="entregables")
    responsable = relationship("Usuario", foreign_keys=[responsable_id])
    historial = relationship(
        "HistorialAvance", back_populates="entregable", cascade="all, delete-orphan"
    )

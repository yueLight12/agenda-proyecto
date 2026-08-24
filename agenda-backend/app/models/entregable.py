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
    # Orden de prioridad entre los entregables del MISMO proyecto/tema
    # (2026-08-19, a petición de Yue: "que quede igual que temas/subtemas")
    # -- mismo patrón que Proyecto.orden, con flechas ↑/↓ en vez de fecha.
    orden = Column(Integer, default=0, nullable=False)
    # Urgencia marcada A MANO por quien asigna (2026-08-20, a petición del
    # cliente) -- se combina con la urgencia AUTOMÁTICA por fecha (vencido,
    # o vence en ≤3 días) para decidir el badge "URGENTE" que se muestra en
    # todas las vistas; ver app/services/entregables.py::es_urgente. Este
    # campo es solo la mitad manual -- "urgente" en el resto del código
    # SIEMPRE es el resultado combinado, nunca este campo solo.
    urgente_manual = Column(Boolean, default=False, nullable=False)
    # Si se activa, el responsable debe subir una imagen de comprobante
    # antes de poder marcar el avance en 100% (2026-08-21, a petición de
    # Yue) -- ver comprobante_path abajo y
    # app/services/entregables.py::actualizar_avance/agregar_comprobante.
    requiere_comprobante = Column(Boolean, default=False, nullable=False)
    # Ruta relativa dentro de uploads/ (mismo patrón que Nota.imagen_path,
    # ver app/models/nota.py) de la imagen de comprobante adjunta. None =
    # sin comprobante. Servida solo vía GET /entregables/{id}/comprobante
    # (mismo permiso que ver el entregable, nunca un mount estático
    # público).
    comprobante_path = Column(String(300), nullable=True)

    proyecto = relationship("Proyecto", back_populates="entregables")
    responsable = relationship("Usuario", foreign_keys=[responsable_id])
    historial = relationship(
        "HistorialAvance", back_populates="entregable", cascade="all, delete-orphan"
    )
    notas = relationship("Nota", back_populates="entregable", cascade="all, delete-orphan")
    historial_responsables = relationship(
        "HistorialResponsable", back_populates="entregable", cascade="all, delete-orphan"
    )

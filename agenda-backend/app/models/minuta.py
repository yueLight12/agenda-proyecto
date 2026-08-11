"""
Modelo de Minuta: notas de una Reunión (acuerdos, pendientes), con la
posibilidad de convertir un acuerdo puntual en un Entregable con
responsable y fecha límite (ver POST /acuerdos/{id}/convertir-a-entregable
en app/routers/minutas.py).

Visibilidad: la minuta hereda la visibilidad de su reunión — no se inventa
una regla nueva, se reutiliza puede_ver_reunion/puede_editar_reunion de
app.core.permissions.
"""
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.database import Base


class Minuta(Base):
    __tablename__ = "minutas"

    id = Column(Integer, primary_key=True, index=True)
    reunion_id = Column(Integer, ForeignKey("reuniones.id"), nullable=False, unique=True)
    contenido = Column(Text, nullable=True)
    creado_por = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    fecha_creacion = Column(DateTime, default=datetime.utcnow, nullable=False)
    fecha_actualizacion = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    reunion = relationship("Reunion")
    acuerdos = relationship(
        "AcuerdoMinuta", back_populates="minuta", cascade="all, delete-orphan"
    )


class AcuerdoMinuta(Base):
    __tablename__ = "acuerdos_minuta"

    id = Column(Integer, primary_key=True, index=True)
    minuta_id = Column(Integer, ForeignKey("minutas.id"), nullable=False)
    descripcion = Column(String(500), nullable=False)
    responsable_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    # Se llena solo al convertir el acuerdo en entregable (no todo acuerdo se convierte).
    entregable_id = Column(Integer, ForeignKey("entregables.id"), nullable=True)
    convertido = Column(Boolean, default=False, nullable=False)
    fecha_creacion = Column(DateTime, default=datetime.utcnow, nullable=False)

    minuta = relationship("Minuta", back_populates="acuerdos")
    responsable = relationship("Usuario", foreign_keys=[responsable_id])
    entregable = relationship("Entregable", foreign_keys=[entregable_id])

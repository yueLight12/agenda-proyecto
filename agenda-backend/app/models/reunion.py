"""
Modelo de Reunión: agendar reuniones u otros eventos dentro de un proyecto
(distinto de un Entregable, no lleva avance ni fecha límite).

Visibilidad (ver app.core.permissions.query_reuniones_visibles):
- N1 del proyecto ve TODAS las reuniones (igual que con entregables).
- El resto solo ve las reuniones en las que participa (organizador o invitado).
"""
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.database import Base


class Reunion(Base):
    __tablename__ = "reuniones"

    id = Column(Integer, primary_key=True, index=True)
    proyecto_id = Column(Integer, ForeignKey("proyectos.id"), nullable=False)
    titulo = Column(String(200), nullable=False)
    notas = Column(Text, nullable=True)
    fecha_inicio = Column(DateTime, nullable=False)
    duracion_minutos = Column(Integer, default=30, nullable=False)
    organizador_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    fecha_creacion = Column(DateTime, default=datetime.utcnow, nullable=False)

    proyecto = relationship("Proyecto", back_populates="reuniones")
    organizador = relationship("Usuario", foreign_keys=[organizador_id])
    participantes = relationship(
        "ReunionParticipante", back_populates="reunion", cascade="all, delete-orphan"
    )
    minuta = relationship(
        "Minuta", back_populates="reunion", uselist=False, cascade="all, delete-orphan"
    )
    notas = relationship("Nota", back_populates="reunion", cascade="all, delete-orphan")


class ReunionParticipante(Base):
    __tablename__ = "reunion_participantes"

    id = Column(Integer, primary_key=True, index=True)
    reunion_id = Column(Integer, ForeignKey("reuniones.id"), nullable=False)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)

    reunion = relationship("Reunion", back_populates="participantes")
    usuario = relationship("Usuario")

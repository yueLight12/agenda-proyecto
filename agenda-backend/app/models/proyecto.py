"""
Modelo de Proyecto.
"""
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text
from sqlalchemy.orm import relationship

from app.database import Base


class Proyecto(Base):
    __tablename__ = "proyectos"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(200), nullable=False)
    descripcion = Column(Text, nullable=True)
    activo = Column(Boolean, default=True, nullable=False)
    fecha_creacion = Column(DateTime, default=datetime.utcnow, nullable=False)

    equipo = relationship(
        "UsuarioProyectoRol", back_populates="proyecto", cascade="all, delete-orphan"
    )
    entregables = relationship(
        "Entregable", back_populates="proyecto", cascade="all, delete-orphan"
    )
    reuniones = relationship(
        "Reunion", back_populates="proyecto", cascade="all, delete-orphan"
    )

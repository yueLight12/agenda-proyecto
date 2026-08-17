"""
Modelo de Proyecto.

`parent_id` (2026-08-16) generaliza Proyecto a un contenedor anidable a
cualquier profundidad -- un "tema"/"subtema" del cliente es, en el modelo,
el mismo Proyecto de siempre, solo que con padre. Los 9 proyectos reales
existentes al momento de este cambio quedan con parent_id NULL (raíz), sin
ningún cambio de comportamiento (ver app/services/arbol_proyectos.py y la
generalización de app/core/permissions.py). `hijos` usa
cascade="all, delete-orphan" -- SQLAlchemy soporta cascada recursiva nativa
en relaciones adjacency-list, así que borrar un nodo borra su subárbol
completo a cualquier profundidad sin CTE ni SQL manual.
"""
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.database import Base


class Proyecto(Base):
    __tablename__ = "proyectos"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(200), nullable=False)
    descripcion = Column(Text, nullable=True)
    activo = Column(Boolean, default=True, nullable=False)
    parent_id = Column(Integer, ForeignKey("proyectos.id"), nullable=True, index=True)
    fecha_creacion = Column(DateTime, default=datetime.utcnow, nullable=False)

    padre = relationship("Proyecto", remote_side=[id], back_populates="hijos")
    hijos = relationship(
        "Proyecto", back_populates="padre", cascade="all, delete-orphan"
    )
    equipo = relationship(
        "UsuarioProyectoRol", back_populates="proyecto", cascade="all, delete-orphan"
    )
    entregables = relationship(
        "Entregable", back_populates="proyecto", cascade="all, delete-orphan"
    )
    reuniones = relationship(
        "Reunion", back_populates="proyecto", cascade="all, delete-orphan"
    )

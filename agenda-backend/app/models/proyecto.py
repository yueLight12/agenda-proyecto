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
    # Orden de importancia GLOBAL entre hermanos (mismo parent_id) -- 2026-08-18,
    # a petición de Yue: "ordenar los temas del más importante al menos
    # importante" en Vista Equipo, con flechas ↑/↓ (mismo patrón que
    # AgendaItem.orden en app/models/agenda_item.py). Se ve igual sin
    # importar en la columna de quién aparezca -- no es por persona.
    orden = Column(Integer, default=0, server_default="0", nullable=False)

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
    series_reunion = relationship(
        "SerieReunion", back_populates="proyecto", cascade="all, delete-orphan"
    )
    # Notas sueltas directo sobre el tema (2026-08-17, caso Diana) -- no
    # confundir con las notas de un entregable/reunión/minuta de este
    # proyecto, que cuelgan de esas entidades, no de aquí.
    notas = relationship("Nota", back_populates="proyecto", cascade="all, delete-orphan")
    # Pendientes reutilizables del tema (2026-08-17) -- sin esta relación,
    # eliminar_proyecto (db.delete(proyecto)) no sabía que debía borrarlos
    # también, y Postgres rechazaba el DELETE por la FK (bug real
    # encontrado por Yue: no se podía borrar un tema con pendientes).
    pendientes = relationship("Pendiente", back_populates="proyecto", cascade="all, delete-orphan")

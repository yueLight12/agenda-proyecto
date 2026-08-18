"""
Modelo de Pendiente: texto reutilizable sobre un tema/subtema, pensado para
poder "jalarse" como un punto más del checklist de una junta recurrente
(AgendaItem.pendiente_id, ver app/models/agenda_item.py) sin tener que
retipearlo cada vez -- mismo espíritu que Nota, pero siempre cuelga de UN
proyecto/tema (no de entregable/reunión/minuta, esos casos ya los cubre
Nota).
"""
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


class Pendiente(Base):
    __tablename__ = "pendientes"

    id = Column(Integer, primary_key=True, index=True)
    # ondelete="CASCADE" además de Proyecto.pendientes (cascade="all,
    # delete-orphan" a nivel ORM) -- defensivo a nivel de base de datos,
    # mismo criterio que AgendaItem.reunion_id, para que borrar un tema no
    # truene por una fila huérfana sin importar el camino de borrado.
    proyecto_id = Column(Integer, ForeignKey("proyectos.id", ondelete="CASCADE"), nullable=False)
    contenido = Column(String(500), nullable=False)
    autor_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    fecha_creacion = Column(DateTime, default=datetime.utcnow, nullable=False)

    proyecto = relationship("Proyecto", back_populates="pendientes")
    autor = relationship("Usuario", foreign_keys=[autor_id])

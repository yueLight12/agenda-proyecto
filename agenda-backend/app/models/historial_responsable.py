"""
Modelo de Historial de Responsable.

Cada vez que un entregable nace o se reasigna a alguien nuevo, se guarda
un registro aquí con quién fue el responsable en ese momento (2026-08-23,
a petición de Yue: la regla de visibilidad de N1/N2 pasó de "veo todo el
tema" a "veo lo de mis subordinados directos, más cualquier tarea donde
yo haya estado involucrado como creador o como responsable en algún
punto de su historia" -- ver app/core/permissions.py::query_entregables_visibles
y app/services/entregables.py). Sin este registro no habría forma de
saber, tras una reasignación, que alguien fue responsable antes.
"""
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer
from sqlalchemy.orm import relationship

from app.database import Base


class HistorialResponsable(Base):
    __tablename__ = "historial_responsable"

    id = Column(Integer, primary_key=True, index=True)
    entregable_id = Column(Integer, ForeignKey("entregables.id"), nullable=False, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False, index=True)
    fecha_desde = Column(DateTime, default=datetime.utcnow, nullable=False)

    entregable = relationship("Entregable", back_populates="historial_responsables")

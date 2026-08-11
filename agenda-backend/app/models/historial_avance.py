"""
Modelo de Historial de Avance.

Cada vez que se actualiza el % de avance de un entregable, se guarda un
registro aquí. Esto permite comparar "avance anterior vs. avance actual".
"""
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer
from sqlalchemy.orm import relationship

from app.database import Base


class HistorialAvance(Base):
    __tablename__ = "historial_avance"

    id = Column(Integer, primary_key=True, index=True)
    entregable_id = Column(Integer, ForeignKey("entregables.id"), nullable=False)
    porcentaje_avance = Column(Integer, nullable=False)
    actualizado_por = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    fecha_registro = Column(DateTime, default=datetime.utcnow, nullable=False)

    entregable = relationship("Entregable", back_populates="historial")

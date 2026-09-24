"""
Modelo de "copiado" en un entregable (2026-09-22, a petición de Yue): una
persona que solo se ENTERA de que existe la tarea -- no es el responsable,
no puede marcarla concluida ni se le pide nada, es el equivalente a un CC
de correo. Varias personas pueden estar copiadas en un mismo entregable.

Solo dispara UNA notificación in-app al copiarlo (tipo `otro`, mismo
patrón que notas/reuniones -- no amerita un tipo dedicado). No cambia
ninguna regla de visibilidad existente: si el copiado puede o no ABRIR la
tarea depende de las reglas normales (o de settings.regla_todos_con_todos,
si está activa) -- esta tabla solo registra la intención de "avisarle" y
para poder mostrar la lista de copiados en el detalle del entregable.
"""
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer
from sqlalchemy.orm import relationship

from app.database import Base


class EntregableCopiado(Base):
    __tablename__ = "entregable_copiados"

    id = Column(Integer, primary_key=True, index=True)
    entregable_id = Column(Integer, ForeignKey("entregables.id", ondelete="CASCADE"), nullable=False)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    fecha_creacion = Column(DateTime, default=datetime.utcnow, nullable=False)

    entregable = relationship("Entregable", back_populates="copiados")
    usuario = relationship("Usuario", foreign_keys=[usuario_id])

"""
Modelo de PendientePersonal: checklist privado de cada usuario (2026-08-27,
a petición de Yue: "pasar por leche en camino a casa", "pagar colegiatura de
los niños" -- cosas que no son ni reuniones ni tareas de proyecto).

A diferencia de TODO lo demás en este sistema (Entregable, Pendiente,
Reunion, Nota), este modelo NO cuelga de ningún proyecto/tema y no tiene
ninguna regla de visibilidad compartida -- es estrictamente privado, el
único criterio de acceso es `usuario_id == quien pregunta`. Por eso no
reutiliza nada de app/core/permissions.py (esa lógica está pensada
alrededor de jerarquías N1-N4 sobre un proyecto, que aquí no existe) --
ver app/services/pendientes_personales.py, el chequeo vive ahí directo.
"""
from datetime import datetime

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


class PendientePersonal(Base):
    __tablename__ = "pendientes_personales"

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False)
    contenido = Column(String(500), nullable=False)
    # Opcional a propósito (2026-08-27, a petición de Yue) -- "pasar por
    # leche" no tiene fecha, "pagar colegiatura" sí puede tenerla. No es un
    # recordatorio con hora como una reunión, es solo una fecha límite para
    # poder ordenar/resaltar, sin disparar notificación propia.
    fecha_limite = Column(Date, nullable=True)
    hecho = Column(Boolean, default=False, nullable=False)
    fecha_creacion = Column(DateTime, default=datetime.utcnow, nullable=False)

    usuario = relationship("Usuario", foreign_keys=[usuario_id])

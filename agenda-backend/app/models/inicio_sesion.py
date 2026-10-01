"""
Historial de inicios de sesión (2026-10-01, a petición de Yue: saber cuántas
personas usaron el sistema por día, no solo el último login de cada quien).
A diferencia de Usuario.ultimo_login (una sola columna que se SOBREESCRIBE en
cada login, así que no se puede reconstruir el historial), esta tabla guarda
UNA fila por cada inicio de sesión exitoso -- ver app/routers/auth.py.
"""
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer
from sqlalchemy.orm import relationship

from app.database import Base


class InicioSesion(Base):
    __tablename__ = "inicios_sesion"

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False)
    fecha = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    usuario = relationship("Usuario")

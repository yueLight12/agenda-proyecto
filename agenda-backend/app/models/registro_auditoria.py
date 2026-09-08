"""
Registro de auditoría de acciones sensibles (2026-09-07, a petición de
Yue: "qué más debería poder hacer un superadmin" -- entre más poder tiene
esa cuenta, más importa poder ver después quién hizo qué. Solo registra
las acciones de administración de usuarios/configuración (no cada clic
de la app -- eso sería ruido, no auditoría útil).
"""
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.database import Base


class RegistroAuditoria(Base):
    __tablename__ = "registros_auditoria"

    id = Column(Integer, primary_key=True, index=True)
    actor_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    # Quién fue AFECTADO por la acción (el usuario editado/eliminado/etc.)
    # -- None para acciones que no apuntan a una persona en particular
    # (ej. cambiar una configuración global). A PROPÓSITO sin ForeignKey:
    # tras un "eliminar_usuario" exitoso, ese id ya no existe en
    # `usuarios` -- una FK real rompería el registro histórico justo del
    # caso que más importa auditar.
    objetivo_id = Column(Integer, nullable=True)
    accion = Column(String(50), nullable=False)
    detalle = Column(Text, nullable=True)
    fecha = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    actor = relationship("Usuario", foreign_keys=[actor_id])

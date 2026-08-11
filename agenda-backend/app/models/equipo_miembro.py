"""
Plantilla de equipo personal: cada usuario (típicamente un N2) guarda una
lista fija de personas + rol default, para aplicarla de un clic a un proyecto
en vez de asignarlas una por una cada vez (ej. "el equipo de David").

No está ligada a ningún proyecto — es del usuario propietario ("mi equipo").
Ver POST /proyectos/{id}/aplicar-mi-equipo en app/routers/equipos.py para
cómo se vuelca a usuario_proyecto_rol al aplicarla.
"""
from datetime import datetime

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import relationship

from app.database import Base
from app.models.usuario import RolEnum


class EquipoMiembro(Base):
    __tablename__ = "equipo_miembros"
    __table_args__ = (
        UniqueConstraint("propietario_id", "usuario_id", name="uq_equipo_propietario_usuario"),
    )

    id = Column(Integer, primary_key=True, index=True)
    propietario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    rol = Column(Enum(RolEnum), nullable=False)
    fecha_creacion = Column(DateTime, default=datetime.utcnow, nullable=False)

    propietario = relationship("Usuario", foreign_keys=[propietario_id])
    usuario = relationship("Usuario", foreign_keys=[usuario_id])

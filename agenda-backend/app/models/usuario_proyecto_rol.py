"""
Tabla puente Usuario-Proyecto-Rol.

Esta es la pieza central del sistema de permisos:
- Un usuario puede tener un rol distinto en cada proyecto (rol por proyecto).
- `supervisor_id` liga a un N3/N4 con el N2 que lo supervisa EN ESE proyecto.
  Esto es lo que permite que "un N2 vea solo a su equipo" y no a todo el proyecto.
"""
from datetime import datetime

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import relationship

from app.database import Base
from app.models.usuario import RolEnum


class UsuarioProyectoRol(Base):
    __tablename__ = "usuario_proyecto_rol"
    __table_args__ = (
        UniqueConstraint("usuario_id", "proyecto_id", name="uq_usuario_proyecto"),
    )

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    proyecto_id = Column(Integer, ForeignKey("proyectos.id"), nullable=False)
    rol = Column(Enum(RolEnum), nullable=False)

    # Solo aplica a N3/N4: a qué N2 reportan dentro de este proyecto
    supervisor_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)

    fecha_asignacion = Column(DateTime, default=datetime.utcnow, nullable=False)

    usuario = relationship(
        "Usuario", back_populates="roles_por_proyecto", foreign_keys=[usuario_id]
    )
    supervisor = relationship("Usuario", foreign_keys=[supervisor_id])
    proyecto = relationship("Proyecto", back_populates="equipo")

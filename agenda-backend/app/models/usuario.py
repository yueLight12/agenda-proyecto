"""
Modelo de Usuario.
"""
import enum
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


class RolEnum(str, enum.Enum):
    N1 = "N1"  # Dirección
    N2 = "N2"  # Líder de proyecto
    N3 = "N3"  # Colaborador interno
    N4 = "N4"  # Colaborador externo


class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(150), nullable=False)
    puesto = Column(String(150), nullable=True)
    email = Column(String(150), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    activo = Column(Boolean, default=True, nullable=False)
    # Control total en TODOS los proyectos (actuales y futuros) sin necesidad de
    # una fila en usuario_proyecto_rol por cada uno. Ver app.core.permissions.
    es_super_admin = Column(Boolean, default=False, nullable=False)
    fecha_creacion = Column(DateTime, default=datetime.utcnow, nullable=False)

    roles_por_proyecto = relationship(
        "UsuarioProyectoRol",
        back_populates="usuario",
        foreign_keys="UsuarioProyectoRol.usuario_id",
        cascade="all, delete-orphan",
    )

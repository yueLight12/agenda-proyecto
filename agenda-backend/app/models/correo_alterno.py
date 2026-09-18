"""
Correos alternos: permiten que una sola cuenta (Usuario) entre al sistema
con más de un correo (2026-09-17, a petición de Yue -- varias personas del
directorio real tienen dos dominios de correo vigentes, ej. corporativo
viejo + nuevo, y ambos siguen en uso). El correo PRINCIPAL sigue viviendo
en Usuario.email (ahí vive el que se usa para mostrar en la UI); cualquier
correo adicional válido para hacer login vive aquí, apuntando a la misma
cuenta. Ver app/routers/auth.py::login para el fallback de búsqueda.
"""
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


class CorreoAlterno(Base):
    __tablename__ = "correos_alternos"

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    # Único a nivel de tabla -- la unicidad CRUZADA contra Usuario.email (que
    # nadie registre como alterno un correo que ya es principal de otra
    # cuenta) se valida a mano en el servicio que lo crea, Postgres no puede
    # expresar un unique constraint entre dos tablas distintas.
    email = Column(String(150), unique=True, nullable=False, index=True)
    fecha_creacion = Column(DateTime, default=datetime.utcnow, nullable=False)

    usuario = relationship("Usuario", foreign_keys=[usuario_id])

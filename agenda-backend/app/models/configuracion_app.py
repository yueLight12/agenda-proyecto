"""
Configuración global editable desde la app (2026-09-07, a petición de
Yue: valores como el proveedor de WhatsApp solo se podían cambiar
editando `.env` y reconstruyendo el contenedor -- un superadmin ahora
puede cambiarlos en caliente desde el panel). Tabla clave/valor simple,
NO reemplaza `.env`/Settings para todo -- solo para los valores puntuales
que se decida exponer aquí (ver app/services/configuracion.py); todo lo
demás (credenciales, llaves, URLs) sigue siendo exclusivo de `.env`.
"""
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String

from app.database import Base


class ConfiguracionApp(Base):
    __tablename__ = "configuraciones_app"

    clave = Column(String(60), primary_key=True)
    valor = Column(String(200), nullable=False)
    actualizado_por = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    fecha_actualizacion = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

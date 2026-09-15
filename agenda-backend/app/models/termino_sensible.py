"""
Diccionario de términos prohibidos (2026-09-15, a petición de Yue): lista
administrada por un superadmin de palabras/frases que no se permiten al
crear o editar tareas, reuniones, proyectos o notas (ej. el nombre de una
persona o un asunto delicado). Si el texto de alguno de esos campos
contiene un término de esta lista (comparación sin distinguir mayúsculas/
minúsculas, substring), la acción se rechaza con un mensaje claro y se deja
un registro en la auditoría existente (ver app/services/contenido_sensible.py
y auditoria.registrar con accion="contenido_sensible_bloqueado") -- para
que el admin pueda ver quién intentó qué, no solo bloquearlo en silencio.
"""
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


class TerminoSensible(Base):
    __tablename__ = "terminos_sensibles"

    id = Column(Integer, primary_key=True, index=True)
    # Se guarda tal cual lo escribió el admin (para mostrarlo igual en la
    # lista); la comparación en contenido_sensible.py normaliza a
    # minúsculas en el momento de buscar, no aquí.
    texto = Column(String(200), nullable=False, unique=True)
    creado_por = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    fecha_creacion = Column(DateTime, default=datetime.utcnow, nullable=False)

    creador = relationship("Usuario")

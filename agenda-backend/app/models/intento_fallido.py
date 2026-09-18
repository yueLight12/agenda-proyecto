"""
Registro de intentos fallidos (2026-09-17, "Opción B" -- a petición de Yue
tras el bug real de asignación de tareas del mismo día: "por ese tipo de
errores es que quiero que el superadmin pueda ver todo para saber por qué
algo falló"). A diferencia de RegistroAuditoria (solo acciones exitosas de
superadmin) y de Actividad (solo acciones exitosas del uso normal), esto
guarda intentos que el backend RECHAZÓ -- ver el middleware en app/main.py
y el caso especial de login en app/routers/auth.py.
"""
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.database import Base


class IntentoFallido(Base):
    __tablename__ = "intentos_fallidos"

    id = Column(Integer, primary_key=True, index=True)
    # Nulo cuando no se pudo identificar a quién lo intentó (ej. login con
    # un correo que no existe en el sistema) -- ver correo_intentado abajo
    # para ese caso.
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    correo_intentado = Column(String(150), nullable=True)
    metodo = Column(String(10), nullable=False)
    ruta = Column(String(300), nullable=False)
    status_code = Column(Integer, nullable=False)
    detalle = Column(Text, nullable=True)
    fecha = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    usuario = relationship("Usuario", foreign_keys=[usuario_id])

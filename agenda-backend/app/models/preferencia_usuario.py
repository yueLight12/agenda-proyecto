"""
Preferencias de apariencia por usuario (panel "Personalizar apariencia",
2026-08-26, a petición de Yue) -- una fila por usuario (usuario_id único),
con las 3 preferencias del alcance acordado: shape (forma de tarjetas/
botones), theme (claro/oscuro) y card_order (orden de las tarjetas de
"Quiero asignar"). Ver app/services/preferencias.py.
"""
from datetime import datetime

from sqlalchemy import JSON, Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


class PreferenciaUsuario(Base):
    __tablename__ = "preferencias_usuario"

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(
        Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    shape = Column(String(20), nullable=False, default="rounded")
    theme = Column(String(20), nullable=False, default="claro")
    # Lista de tipos de tarjeta ("tarea", "proyecto", ...) en el orden
    # elegido por el usuario -- null hasta que el usuario guarda por
    # primera vez, el frontend usa el orden por defecto en ese caso.
    card_order = Column(JSON, nullable=True)
    # Tipos de tarjeta que el usuario decidió ocultar de "Quiero asignar"
    # (2026-08-31, a petición de Yue: "que un usuario pueda elegir que no le
    # interesa ver Proyectos, por ejemplo") -- null/[] = todas visibles.
    # Ocultar una tarjeta es solo una preferencia de vista: no bloquea la
    # función correspondiente en ningún otro lado (decisión explícita de Yue).
    tarjetas_ocultas = Column(JSON, nullable=True)
    # FTUE/onboarding (2026-09-15, a petición de Yue, pensando en las
    # 20-30 personas que van a usar el sistema por primera vez en el
    # piloto) -- True una vez que alguien completa o cierra el recorrido
    # guiado (ver OnboardingTour.jsx), para que no se le muestre de nuevo
    # en su próximo login/dispositivo. Default False = nunca lo ha visto.
    tour_completado = Column(Boolean, default=False, nullable=False)
    fecha_actualizacion = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    usuario = relationship("Usuario")

"""
Modelo de SerieReunion: la regla de una reunión recurrente ("todos los
lunes a las 10am"). Cada ocurrencia real se materializa con antelación
como una Reunion normal (ver Reunion.serie_id y
app/services/materializar_series.py) -- una SerieReunion nunca aparece
directamente en el calendario, solo sus ocurrencias.

Visibilidad: igual que una Reunion suelta (ver
app.core.permissions.query_reuniones_visibles) -- organizador/invitado, o
N1 del tema (local o heredado) ve todas las series de ese tema/subárbol.
proyecto_id nullable, igual que Reunion -- puede ser una serie general.
"""
from datetime import datetime

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, String, Time
from sqlalchemy.orm import relationship

from app.database import Base


class SerieReunion(Base):
    __tablename__ = "series_reunion"

    id = Column(Integer, primary_key=True, index=True)
    proyecto_id = Column(Integer, ForeignKey("proyectos.id"), nullable=True)
    titulo = Column(String(200), nullable=False)
    organizador_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    # Regla de recurrencia simple: "cada semana en este día, a esta hora" --
    # no se soportan reglas más complejas (cada N semanas, mensual, etc.) a
    # propósito, es lo que se pidió ("occasional/muy recurrente, ej. cada
    # lunes 10am"). dia_semana: 0=lunes ... 6=domingo (convención de
    # datetime.weekday()).
    dia_semana = Column(Integer, nullable=False)
    hora = Column(Time, nullable=False)
    duracion_minutos = Column(Integer, default=30, nullable=False)
    fecha_inicio = Column(Date, nullable=False)
    fecha_fin = Column(Date, nullable=True)  # None = indefinida
    activa = Column(Boolean, default=True, nullable=False)
    fecha_creacion = Column(DateTime, default=datetime.utcnow, nullable=False)

    proyecto = relationship("Proyecto")
    organizador = relationship("Usuario", foreign_keys=[organizador_id])
    participantes = relationship(
        "SerieReunionParticipante", back_populates="serie", cascade="all, delete-orphan"
    )
    ocurrencias = relationship("Reunion", back_populates="serie")
    agenda_items = relationship(
        "AgendaItem", back_populates="serie", cascade="all, delete-orphan"
    )


class SerieReunionParticipante(Base):
    __tablename__ = "serie_reunion_participantes"

    id = Column(Integer, primary_key=True, index=True)
    serie_id = Column(Integer, ForeignKey("series_reunion.id"), nullable=False)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)

    serie = relationship("SerieReunion", back_populates="participantes")
    usuario = relationship("Usuario")

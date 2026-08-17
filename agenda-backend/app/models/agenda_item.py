"""
Modelo de agenda persistente para reuniones recurrentes: AgendaItem (la
lista fija de cosas a revisar en cada ocurrencia de una SerieReunion) y
AgendaItemRevision (la bitácora -- un registro por cada vez que se toca un
ítem en una ocurrencia puntual).

Diseño clave (confirmado con Yue, 2026-08-17): el "estado actual" de un
AgendaItem NUNCA se guarda como columna aparte -- se deriva siempre de su
AgendaItemRevision más reciente (o "pendiente" si nunca se ha revisado).
Así lo no revisado en una ocurrencia sigue apareciendo pendiente en la
siguiente automáticamente (arrastra estado), sin ningún job de reseteo, y
sin dos fuentes de verdad que puedan desincronizarse. Ver
app/services/series_reunion.py::agenda_actual_de_serie.

Visibilidad: un AgendaItem hereda la visibilidad de su serie (misma regla
que una Reunion) -- no se define ninguna regla nueva aquí, ver
app/services/series_reunion.py.
"""
import enum
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.database import Base


class TipoAgendaItem(str, enum.Enum):
    tema = "tema"  # referencia a un nodo del árbol de temas (proyecto_id)
    entregable = "entregable"
    acuerdo = "acuerdo"  # seguimiento a un acuerdo de una ocurrencia anterior
    pendiente = "pendiente"  # texto libre, sin entidad real detrás


class EstadoRevision(str, enum.Enum):
    revisado = "revisado"
    pendiente = "pendiente"
    revisado_con_pendientes = "revisado_con_pendientes"


class AgendaItem(Base):
    __tablename__ = "agenda_items"

    id = Column(Integer, primary_key=True, index=True)
    serie_id = Column(Integer, ForeignKey("series_reunion.id"), nullable=False)
    tipo = Column(Enum(TipoAgendaItem), nullable=False)
    proyecto_id = Column(Integer, ForeignKey("proyectos.id"), nullable=True)
    entregable_id = Column(Integer, ForeignKey("entregables.id"), nullable=True)
    acuerdo_id = Column(Integer, ForeignKey("acuerdos_minuta.id"), nullable=True)
    texto = Column(String(500), nullable=True)
    orden = Column(Integer, default=0, nullable=False)
    activo = Column(Boolean, default=True, nullable=False)  # "archivado" si False
    # De qué ocurrencia salió este ítem (ej. un pendiente que surgió en la
    # plática) -- trazabilidad, no afecta permisos ni visibilidad.
    creado_en_reunion_id = Column(Integer, ForeignKey("reuniones.id"), nullable=True)
    fecha_creacion = Column(DateTime, default=datetime.utcnow, nullable=False)

    serie = relationship("SerieReunion", back_populates="agenda_items")
    proyecto = relationship("Proyecto")
    entregable = relationship("Entregable")
    acuerdo = relationship("AcuerdoMinuta")
    creado_en_reunion = relationship("Reunion", foreign_keys=[creado_en_reunion_id])
    revisiones = relationship(
        "AgendaItemRevision", back_populates="agenda_item", cascade="all, delete-orphan"
    )


class AgendaItemRevision(Base):
    __tablename__ = "agenda_item_revisiones"

    id = Column(Integer, primary_key=True, index=True)
    agenda_item_id = Column(Integer, ForeignKey("agenda_items.id"), nullable=False)
    reunion_id = Column(Integer, ForeignKey("reuniones.id"), nullable=False)
    estado = Column(Enum(EstadoRevision), nullable=False)
    nota = Column(Text, nullable=True)
    registrado_por = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    fecha_registro = Column(DateTime, default=datetime.utcnow, nullable=False)

    agenda_item = relationship("AgendaItem", back_populates="revisiones")
    reunion = relationship("Reunion")
    usuario = relationship("Usuario", foreign_keys=[registrado_por])

"""
Esquemas Pydantic: Reunión.
"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ReunionCrear(BaseModel):
    titulo: str
    notas: Optional[str] = None
    fecha_inicio: datetime
    duracion_minutos: int = 30
    participantes_ids: list[int] = []
    # Minutos de antelación para el recordatorio -- None = sin recordatorio.
    recordatorio_minutos_antes: Optional[int] = None


class ReunionActualizar(BaseModel):
    titulo: Optional[str] = None
    notas: Optional[str] = None
    fecha_inicio: Optional[datetime] = None
    duracion_minutos: Optional[int] = None
    participantes_ids: Optional[list[int]] = None
    recordatorio_minutos_antes: Optional[int] = None


class ParticipanteOut(BaseModel):
    usuario_id: int
    nombre: str
    # None = asistencia todavía no tomada -- ver ReunionParticipante.asistio.
    asistio: Optional[bool] = None

    class Config:
        from_attributes = True


class AsistenciaActualizar(BaseModel):
    # Optional para poder "deshacer" una marca por error (mandar null vuelve
    # a "no tomada"), no solo alternar entre asistió/no asistió.
    asistio: Optional[bool] = None


class ReunionOut(BaseModel):
    id: int
    proyecto_id: Optional[int] = None  # None = reunión "general", sin tema
    titulo: str
    notas: Optional[str] = None
    fecha_inicio: datetime
    duracion_minutos: int
    recordatorio_minutos_antes: Optional[int] = None
    organizador_id: int
    organizador_nombre: str
    participantes: list[ParticipanteOut] = []
    # Calculado en servidor (2026-08-16) -- ver puede_editar_reunion.
    puede_editar: bool = False
    # None = ocurrencia suelta, sin cambio. Si tiene valor, es una
    # ocurrencia materializada de una SerieReunion (2026-08-17) -- el
    # frontend lo usa para mostrar la sección "Agenda de esta reunión" en
    # ModalMinuta.jsx.
    serie_id: Optional[int] = None

    class Config:
        from_attributes = True

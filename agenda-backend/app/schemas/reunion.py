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


class ReunionActualizar(BaseModel):
    titulo: Optional[str] = None
    notas: Optional[str] = None
    fecha_inicio: Optional[datetime] = None
    duracion_minutos: Optional[int] = None
    participantes_ids: Optional[list[int]] = None


class ParticipanteOut(BaseModel):
    usuario_id: int
    nombre: str

    class Config:
        from_attributes = True


class ReunionOut(BaseModel):
    id: int
    proyecto_id: Optional[int] = None  # None = reunión "general", sin tema
    titulo: str
    notas: Optional[str] = None
    fecha_inicio: datetime
    duracion_minutos: int
    organizador_id: int
    organizador_nombre: str
    participantes: list[ParticipanteOut] = []
    # Calculado en servidor (2026-08-16) -- ver puede_editar_reunion.
    puede_editar: bool = False

    class Config:
        from_attributes = True

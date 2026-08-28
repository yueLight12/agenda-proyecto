"""
Esquemas Pydantic: PendientePersonal, checklist privado de cada usuario
(ver app/models/pendiente_personal.py).
"""
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel


class PendientePersonalCrear(BaseModel):
    contenido: str
    fecha_limite: Optional[date] = None


class PendientePersonalActualizar(BaseModel):
    contenido: Optional[str] = None
    fecha_limite: Optional[date] = None
    hecho: Optional[bool] = None


class PendientePersonalOut(BaseModel):
    id: int
    contenido: str
    fecha_limite: Optional[date] = None
    hecho: bool
    fecha_creacion: datetime

    class Config:
        from_attributes = True

"""
Esquemas Pydantic: PendientePersonal, checklist privado de cada usuario
(ver app/models/pendiente_personal.py).
"""
from datetime import date, datetime, time
from typing import Literal, Optional

from pydantic import BaseModel

RecurrenciaPendiente = Literal["ninguna", "semanal", "mensual", "anual"]


class PendientePersonalCrear(BaseModel):
    contenido: str
    fecha_limite: Optional[date] = None
    hora_limite: Optional[time] = None
    recurrencia: RecurrenciaPendiente = "ninguna"


class PendientePersonalActualizar(BaseModel):
    contenido: Optional[str] = None
    fecha_limite: Optional[date] = None
    hora_limite: Optional[time] = None
    hecho: Optional[bool] = None
    recurrencia: Optional[RecurrenciaPendiente] = None


class PendientePersonalOut(BaseModel):
    id: int
    contenido: str
    fecha_limite: Optional[date] = None
    hora_limite: Optional[time] = None
    hecho: bool
    recurrencia: RecurrenciaPendiente
    fecha_creacion: datetime

    class Config:
        from_attributes = True

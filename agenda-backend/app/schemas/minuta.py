"""
Esquemas Pydantic: Minuta y acuerdos.
"""
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel


class MinutaCrear(BaseModel):
    contenido: Optional[str] = None


class AcuerdoCrear(BaseModel):
    descripcion: str
    responsable_id: Optional[int] = None


class AcuerdoOut(BaseModel):
    id: int
    descripcion: str
    responsable_id: Optional[int] = None
    responsable_nombre: Optional[str] = None
    entregable_id: Optional[int] = None
    convertido: bool

    class Config:
        from_attributes = True


class MinutaOut(BaseModel):
    id: int
    reunion_id: int
    contenido: Optional[str] = None
    creado_por: int
    fecha_actualizacion: datetime
    acuerdos: list[AcuerdoOut] = []

    class Config:
        from_attributes = True


class ConvertirAcuerdoRequest(BaseModel):
    fecha_entrega: date
    sensible: bool = False

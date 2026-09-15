"""
Esquemas Pydantic: diccionario de términos sensibles/prohibidos.
"""
from datetime import datetime

from pydantic import BaseModel


class TerminoSensibleCrear(BaseModel):
    texto: str


class TerminoSensibleOut(BaseModel):
    id: int
    texto: str
    fecha_creacion: datetime

    class Config:
        from_attributes = True

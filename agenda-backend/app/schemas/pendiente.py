"""
Esquemas Pydantic: Pendiente reutilizable sobre un proyecto/tema (ver
app/models/pendiente.py).
"""
from datetime import datetime

from pydantic import BaseModel


class PendienteCrear(BaseModel):
    contenido: str
    proyecto_id: int


class PendienteOut(BaseModel):
    id: int
    proyecto_id: int
    contenido: str
    autor_id: int
    autor_nombre: str
    fecha_creacion: datetime

    class Config:
        from_attributes = True

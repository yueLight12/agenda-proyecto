"""
Esquemas Pydantic para "mi equipo" (plantilla personal reutilizable).
"""
from typing import Optional

from pydantic import BaseModel

from app.models.usuario import RolEnum


class EquipoMiembroCrear(BaseModel):
    usuario_id: int
    rol: RolEnum


class PersonaNuevaCrear(BaseModel):
    nombre: str
    puesto: Optional[str] = None
    email: str
    rol: RolEnum


class EquipoMiembroOut(BaseModel):
    usuario_id: int
    nombre: str
    puesto: Optional[str] = None
    email: str
    rol: RolEnum

    class Config:
        from_attributes = True

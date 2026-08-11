"""
Esquemas Pydantic: Proyecto y asignación de roles por proyecto.
"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.models.usuario import RolEnum


class ProyectoBase(BaseModel):
    nombre: str
    descripcion: Optional[str] = None


class ProyectoCrear(ProyectoBase):
    pass


class ProyectoActualizar(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    activo: Optional[bool] = None


class ProyectoOut(ProyectoBase):
    id: int
    activo: bool
    fecha_creacion: datetime

    class Config:
        from_attributes = True


class AsignarRolRequest(BaseModel):
    usuario_id: int
    rol: RolEnum
    supervisor_id: Optional[int] = None  # requerido si rol es N3 o N4


class MiembroEquipoOut(BaseModel):
    usuario_id: int
    nombre: str
    puesto: Optional[str] = None
    email: str
    rol: RolEnum
    supervisor_id: Optional[int] = None

    class Config:
        from_attributes = True

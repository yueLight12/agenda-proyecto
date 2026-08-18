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
    # True = fila real en tu plantilla guardada (se puede quitar). False =
    # reporte real tuyo (supervisor_id en algún tema) que se muestra aquí
    # de solo lectura porque todavía no lo guardaste a mano -- ver
    # app/services/equipos.py::listar_mi_equipo_efectivo. Default True
    # para no romper los demás usos de este schema (agregar/aplicar
    # plantilla), que siempre son filas guardadas de verdad.
    guardado: bool = True

    class Config:
        from_attributes = True

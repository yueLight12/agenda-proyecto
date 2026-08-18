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
    parent_id: Optional[int] = None  # tema/subtema padre -- None = nodo raíz


class ProyectoActualizar(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    activo: Optional[bool] = None


class ProyectoOut(ProyectoBase):
    id: int
    activo: bool
    parent_id: Optional[int] = None
    fecha_creacion: datetime
    # Calculados en servidor por proyecto_a_out (2026-08-16, generalización a
    # árbol de temas/subtemas) -- el frontend NUNCA debe recalcular permiso
    # cruzando usuario.roles_por_proyecto, porque con herencia un permiso
    # puede venir de un ancestro y ese cálculo local se rompe en silencio.
    rol_efectivo: Optional[RolEnum] = None
    puede_administrar: bool = False
    tiene_hijos: bool = False

    class Config:
        from_attributes = True


class AsignarRolRequest(BaseModel):
    usuario_id: int
    rol: RolEnum
    supervisor_id: Optional[int] = None  # requerido si rol es N3 o N4


class ProyectoArbolOut(BaseModel):
    id: int
    nombre: str
    ruta: str  # "Tema > Subtema > Subtema hijo" -- para selectores planos
    # 2026-08-18, selector de temas del checklist 1:1: para armar un árbol
    # real (checkboxes con cascada padre->hijos) en vez de solo la lista
    # plana con `ruta`. None si es un tema raíz.
    parent_id: Optional[int] = None


class MiembroEquipoOut(BaseModel):
    usuario_id: int
    nombre: str
    puesto: Optional[str] = None
    email: str
    rol: RolEnum
    supervisor_id: Optional[int] = None

    class Config:
        from_attributes = True

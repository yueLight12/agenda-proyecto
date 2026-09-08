"""
Esquemas del panel de administración (superadmin) -- 2026-09-07.
"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ReasignarTodoRequest(BaseModel):
    origen_id: int
    destino_id: int


class ReasignarTodoOut(BaseModel):
    origen: str
    destino: str
    movimientos: dict[str, int]


class ConfiguracionActualizar(BaseModel):
    clave: str
    valor: str


class RegistroAuditoriaOut(BaseModel):
    id: int
    fecha: datetime
    actor_id: int
    actor_nombre: str
    accion: str
    objetivo_id: Optional[int] = None
    objetivo_nombre: Optional[str] = None
    detalle: Optional[dict] = None

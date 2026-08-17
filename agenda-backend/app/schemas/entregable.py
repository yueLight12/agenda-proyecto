"""
Esquemas Pydantic: Entregable e Historial de Avance.
"""
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.models.entregable import EstatusEntregable


class EntregableBase(BaseModel):
    nombre: str
    descripcion: Optional[str] = None
    responsable_id: int
    fecha_entrega: date
    sensible: bool = False


class EntregableCrear(EntregableBase):
    pass


class EntregableActualizar(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    responsable_id: Optional[int] = None
    fecha_entrega: Optional[date] = None
    sensible: Optional[bool] = None
    estatus: Optional[EstatusEntregable] = None


class ActualizarAvanceRequest(BaseModel):
    porcentaje_avance: int = Field(ge=0, le=100)


class HistorialAvanceOut(BaseModel):
    id: int
    porcentaje_avance: int
    actualizado_por: int
    fecha_registro: datetime

    class Config:
        from_attributes = True


class EntregableOut(EntregableBase):
    id: int
    proyecto_id: int
    porcentaje_avance: int
    estatus: EstatusEntregable
    creado_por: int
    fecha_creacion: datetime
    # Calculado en servidor (2026-08-16, generalización a árbol de temas) --
    # el frontend nunca debe recalcular permiso cruzando
    # usuario.roles_por_proyecto, que se rompe con herencia. Ver
    # app/services/entregables.py::entregable_a_out.
    puede_editar: bool = False

    class Config:
        from_attributes = True

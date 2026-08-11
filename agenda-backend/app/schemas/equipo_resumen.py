"""
Esquemas Pydantic: resumen de equipo multi-proyecto (ver
app/services/equipo_resumen.py). Se construyen a mano en el servicio, no
directo desde el ORM, así que no usan `from_attributes`.
"""
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel

from app.models.entregable import EstatusEntregable
from app.models.usuario import RolEnum


class EntregableResumenPersonaOut(BaseModel):
    id: int
    nombre: str
    fecha_entrega: date
    porcentaje_avance: int
    estatus: EstatusEntregable
    sensible: bool


class ReunionResumenPersonaOut(BaseModel):
    id: int
    titulo: str
    fecha_inicio: datetime
    rol_en_reunion: str  # "organiza" | "invitado" — solo para la UI, no cambia la regla de visibilidad


class ProyectoDeMiembroOut(BaseModel):
    proyecto_id: int
    proyecto_nombre: str
    rol: RolEnum
    supervisor_id: Optional[int] = None
    entregables: list[EntregableResumenPersonaOut] = []
    reuniones: list[ReunionResumenPersonaOut] = []


class MiembroResumenOut(BaseModel):
    usuario_id: int
    nombre: str
    puesto: Optional[str] = None
    email: str
    proyectos: list[ProyectoDeMiembroOut] = []


class ResumenEquipoOut(BaseModel):
    miembros: list[MiembroResumenOut] = []

"""
Esquemas Pydantic: Dashboard ejecutivo (resumen agregado multi-proyecto).
"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ResumenPorProyectoOut(BaseModel):
    proyecto_id: int
    proyecto_nombre: str
    porcentaje_avance: float
    total_entregables: int
    entregables_vencidos: int
    entregables_proximos_a_vencer: int


class ReunionProximaOut(BaseModel):
    id: int
    proyecto_id: int
    proyecto_nombre: str
    titulo: str
    fecha_inicio: datetime
    organizador_nombre: str


class DashboardOut(BaseModel):
    porcentaje_avance_global: float
    total_proyectos: int
    total_entregables: int
    entregables_vencidos: int
    entregables_proximos_a_vencer: int
    entregables_cumplidos: int
    notificaciones_no_leidas: int
    proyectos: list[ResumenPorProyectoOut] = []
    reuniones_proximas: list[ReunionProximaOut] = []

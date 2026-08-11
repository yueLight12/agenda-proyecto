"""
Esquemas Pydantic: Dashboard ejecutivo (resumen agregado multi-proyecto).
"""
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel

from app.models.entregable import EstatusEntregable


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


class EntregableAtencionOut(BaseModel):
    """
    Entregable individual vencido o próximo a vencer, para la lista
    "Requiere tu atención" de la vista simplificada de N1 (ver Dashboard.jsx
    / DashboardSimplificado.jsx). Se arma en el mismo loop que ya calcula
    los conteos por proyecto, sin queries adicionales.
    """

    id: int
    proyecto_id: int
    proyecto_nombre: str
    nombre: str
    responsable_id: int
    responsable_nombre: str
    fecha_entrega: date
    porcentaje_avance: int
    estatus: EstatusEntregable
    urgencia: str  # "vencido" | "proximo"


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
    entregables_atencion: list[EntregableAtencionOut] = []

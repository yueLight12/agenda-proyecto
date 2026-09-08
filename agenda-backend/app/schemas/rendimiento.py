"""
Esquemas de salida de "Rendimiento" (métricas de desempeño por
persona/proyecto/estatus).
"""
from typing import Optional

from pydantic import BaseModel


class RendimientoPersonaOut(BaseModel):
    usuario_id: int
    nombre: str
    completadas: int
    a_tiempo: int
    tarde: int
    pendientes_actuales: int
    total_asignadas: int
    asignadas_en_periodo: int
    vencidas: int
    dias_atraso_max: int
    dias_atraso_promedio: float
    proyectos: int


class PorEstatusOut(BaseModel):
    pendiente: int
    en_progreso: int
    cumplido: int


class ProyectoCargaOut(BaseModel):
    proyecto_id: Optional[int] = None
    nombre: str
    total: int


class TendenciaSemanaOut(BaseModel):
    etiqueta: str
    completadas: int


class ResumenDashboardOut(BaseModel):
    por_estatus: PorEstatusOut
    por_proyecto: list[ProyectoCargaOut]
    tendencia: list[TendenciaSemanaOut]


class TasaAprobacionPersonaOut(BaseModel):
    usuario_id: int
    nombre: str
    aprobadas: int
    rechazadas: int
    tasa_aprobacion: Optional[float] = None


class ActividadHoraOut(BaseModel):
    hora: int
    total: int


class ActividadDiaOut(BaseModel):
    dia: str
    total: int


class ActividadOut(BaseModel):
    por_hora: list[ActividadHoraOut]
    por_dia_semana: list[ActividadDiaOut]

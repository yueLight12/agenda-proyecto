"""
Esquema de salida de "Rendimiento" (métricas de desempeño por persona).
"""
from pydantic import BaseModel


class RendimientoPersonaOut(BaseModel):
    usuario_id: int
    nombre: str
    completadas: int
    a_tiempo: int
    tarde: int
    pendientes_actuales: int
    asignadas_en_periodo: int
    proyectos: int

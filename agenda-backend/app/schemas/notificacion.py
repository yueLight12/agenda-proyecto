"""
Esquemas Pydantic: Notificaciones y Resumen ejecutivo.
"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.models.notificacion import TipoNotificacion


class NotificacionOut(BaseModel):
    id: int
    entregable_id: Optional[int] = None
    evento_empresa_id: Optional[int] = None
    tipo: TipoNotificacion
    mensaje: str
    leida: bool
    fecha_creacion: datetime
    # 2026-08-20, a petición del cliente: la notificación de una
    # asignación urgente debe destacarse ("lo primero que se ve").
    urgente: bool = False

    class Config:
        from_attributes = True


class ResumenProyectoOut(BaseModel):
    proyecto_id: int
    proyecto_nombre: str
    porcentaje_avance_global: float
    total_entregables: int
    entregables_vencidos: int
    entregables_proximos_a_vencer: int
    entregables_cumplidos: int

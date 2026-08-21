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
    reunion_id: Optional[int] = None
    tipo: TipoNotificacion
    mensaje: str
    leida: bool
    fecha_creacion: datetime
    # 2026-08-20, a petición del cliente: la notificación de una
    # asignación urgente debe destacarse ("lo primero que se ve").
    urgente: bool = False
    # Resuelto a mano en el router (2026-08-21, reporte real de Yue: en
    # Agenda Plan B, una notificación de "te asignaron X" no era
    # clickeable ni tenía botón de marcar concluido como las demás filas
    # de pendientes, porque le faltaba el proyecto_id para armar el link).
    # Notificacion NO tiene relación ORM a Entregable/Reunion (solo el FK
    # crudo), así que esto no sale de un atributo directo del modelo.
    proyecto_id: Optional[int] = None

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

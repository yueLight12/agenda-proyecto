"""
Esquemas Pydantic: Solicitud de ausencia (vacaciones/permiso/incapacidad).
"""
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.models.solicitud_ausencia import EstatusSolicitudAusencia, TipoAusencia


class SolicitudAusenciaCrear(BaseModel):
    tipo: TipoAusencia
    fecha_inicio: date
    fecha_fin: date
    # "Copiar a" (2026-09-23) -- mismo concepto que EntregableCrear.copiados_ids.
    copiados_ids: list[int] = []


class RechazarSolicitudRequest(BaseModel):
    nota_rechazo: str = Field(min_length=1)


class CopiadoSolicitudOut(BaseModel):
    usuario_id: int
    nombre: str

    class Config:
        from_attributes = True


class SolicitudAusenciaOut(BaseModel):
    id: int
    solicitante_id: int
    solicitante_nombre: str = ""
    aprobador_id: Optional[int] = None
    aprobador_nombre: str = ""
    tipo: TipoAusencia
    fecha_inicio: date
    fecha_fin: date
    estatus: EstatusSolicitudAusencia
    nota_rechazo: Optional[str] = None
    fecha_creacion: datetime
    fecha_resolucion: Optional[datetime] = None
    copiados: list[CopiadoSolicitudOut] = []
    # Calculados en servidor, mismo criterio que EntregableOut.puede_editar
    # -- el frontend nunca decide esto solo.
    puede_resolver: bool = False

    class Config:
        from_attributes = True

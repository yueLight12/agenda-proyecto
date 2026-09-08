"""
Router de "Rendimiento": métricas de desempeño por persona sobre el mismo
conjunto de entregables que cada quien ya puede ver -- ver
app/services/rendimiento.py, no agrega ninguna regla de permisos nueva.
"""
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import obtener_usuario_actual
from app.models.usuario import Usuario
from app.schemas.rendimiento import (
    ActividadOut,
    RendimientoPersonaOut,
    ResumenDashboardOut,
    TasaAprobacionPersonaOut,
)
from app.services.reportes_pdf import generar_pdf_rendimiento
from app.services.rendimiento import (
    calcular_actividad,
    calcular_rendimiento_equipo,
    calcular_resumen_dashboard,
    calcular_tasa_aprobacion,
)

router = APIRouter(tags=["Rendimiento"])


@router.get("/rendimiento", response_model=list[RendimientoPersonaOut])
def obtener_rendimiento(
    periodo: Literal["semana", "mes", "todo"] = "mes",
    proyecto_id: Optional[int] = None,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    return calcular_rendimiento_equipo(db, usuario, periodo, proyecto_id)


@router.get("/rendimiento/resumen", response_model=ResumenDashboardOut)
def obtener_resumen_rendimiento(
    proyecto_id: Optional[int] = None,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    return calcular_resumen_dashboard(db, usuario, proyecto_id)


@router.get("/rendimiento/aprobacion", response_model=list[TasaAprobacionPersonaOut])
def obtener_tasa_aprobacion(
    periodo: Literal["semana", "mes", "todo"] = "mes",
    proyecto_id: Optional[int] = None,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    return calcular_tasa_aprobacion(db, usuario, periodo, proyecto_id)


@router.get("/rendimiento/actividad", response_model=ActividadOut)
def obtener_actividad(
    periodo: Literal["semana", "mes", "todo"] = "mes",
    proyecto_id: Optional[int] = None,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    return calcular_actividad(db, usuario, periodo, proyecto_id)


@router.get("/rendimiento/reporte-pdf")
def obtener_reporte_pdf(
    periodo: Literal["semana", "mes", "todo"] = "mes",
    proyecto_id: Optional[int] = None,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    pdf_bytes = generar_pdf_rendimiento(db, usuario, periodo, proyecto_id)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="rendimiento_{periodo}.pdf"'},
    )

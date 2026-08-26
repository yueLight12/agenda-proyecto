"""
Router de "Rendimiento": métricas de desempeño por persona sobre el mismo
conjunto de entregables que cada quien ya puede ver -- ver
app/services/rendimiento.py, no agrega ninguna regla de permisos nueva.
"""
from typing import Literal, Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import obtener_usuario_actual
from app.models.usuario import Usuario
from app.schemas.rendimiento import RendimientoPersonaOut, ResumenDashboardOut
from app.services.rendimiento import calcular_rendimiento_equipo, calcular_resumen_dashboard

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

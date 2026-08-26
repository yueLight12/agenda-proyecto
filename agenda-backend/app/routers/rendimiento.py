"""
Router de "Rendimiento": métricas de desempeño por persona sobre el mismo
conjunto de entregables que cada quien ya puede ver -- ver
app/services/rendimiento.py, no agrega ninguna regla de permisos nueva.
"""
from typing import Literal

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import obtener_usuario_actual
from app.models.usuario import Usuario
from app.schemas.rendimiento import RendimientoPersonaOut
from app.services.rendimiento import calcular_rendimiento_equipo

router = APIRouter(tags=["Rendimiento"])


@router.get("/rendimiento", response_model=list[RendimientoPersonaOut])
def obtener_rendimiento(
    periodo: Literal["semana", "mes", "todo"] = "mes",
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    return calcular_rendimiento_equipo(db, usuario, periodo)

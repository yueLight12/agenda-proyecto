"""
Router de resumen de equipo multi-proyecto: para un N1/N2, agrega en un
solo lugar equipo + entregables + reuniones de TODOS los proyectos donde
participa, agrupado por persona (no por proyecto) — pensado para ver y
administrar su equipo rápido, sin entrar proyecto por proyecto. Reutiliza
`listar_equipo_visible` / `query_entregables_visibles` /
`query_reuniones_visibles` tal cual (ver app/services/equipo_resumen.py);
no define ninguna regla de visibilidad nueva.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import obtener_usuario_actual
from app.models.usuario import Usuario
from app.schemas.equipo_resumen import ResumenEquipoOut
from app.services.equipo_resumen import resumen_equipo_multiproyecto

router = APIRouter(prefix="/equipo", tags=["Resumen de equipo"])


@router.get("/resumen", response_model=ResumenEquipoOut)
def resumen_equipo(
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    miembros = resumen_equipo_multiproyecto(db, usuario)
    return ResumenEquipoOut(miembros=miembros)

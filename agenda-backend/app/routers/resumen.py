"""
Router de resumen ejecutivo (vista para N1/N2, sección 6 - Vista 3 del diseño).
"""
from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.permissions import query_entregables_visibles
from app.database import get_db
from app.dependencies import obtener_usuario_actual
from app.models.entregable import EstatusEntregable
from app.models.proyecto import Proyecto
from app.models.usuario import Usuario
from app.schemas.notificacion import ResumenProyectoOut

router = APIRouter(prefix="/proyectos", tags=["Resumen ejecutivo"])


@router.get("/{proyecto_id}/resumen", response_model=ResumenProyectoOut)
def resumen_proyecto(
    proyecto_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """
    Calcula el resumen SOLO sobre los entregables visibles para el usuario
    (un N2 ve el resumen de su equipo, no de todo el proyecto; un N1 ve todo).
    """
    proyecto = db.query(Proyecto).filter(Proyecto.id == proyecto_id).first()

    entregables = query_entregables_visibles(db, usuario, proyecto_id).all()
    hoy = date.today()
    limite_alerta = hoy + timedelta(days=settings.dias_alerta_entregable)

    total = len(entregables)
    cumplidos = sum(1 for e in entregables if e.estatus == EstatusEntregable.cumplido)
    vencidos = sum(
        1
        for e in entregables
        if e.estatus != EstatusEntregable.cumplido and e.fecha_entrega < hoy
    )
    proximos = sum(
        1
        for e in entregables
        if e.estatus != EstatusEntregable.cumplido
        and hoy <= e.fecha_entrega <= limite_alerta
    )
    avance_global = (
        sum(e.porcentaje_avance for e in entregables) / total if total > 0 else 0.0
    )

    return ResumenProyectoOut(
        proyecto_id=proyecto_id,
        proyecto_nombre=proyecto.nombre if proyecto else "",
        porcentaje_avance_global=round(avance_global, 1),
        total_entregables=total,
        entregables_vencidos=vencidos,
        entregables_proximos_a_vencer=proximos,
        entregables_cumplidos=cumplidos,
    )

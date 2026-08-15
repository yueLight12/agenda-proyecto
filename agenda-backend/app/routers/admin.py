"""
Endpoints administrativos de utilidad para el MVP/pruebas.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import obtener_usuario_actual
from app.models.usuario import Usuario
from app.services.recordatorios import (
    generar_recordatorios,
    generar_recordatorios_cumpleanos,
    generar_recordatorios_reuniones_hoy,
)

router = APIRouter(prefix="/admin", tags=["Administración"])


@router.post("/generar-recordatorios")
def disparar_generacion_recordatorios(
    db: Session = Depends(get_db), usuario: Usuario = Depends(obtener_usuario_actual)
):
    """
    Dispara manualmente el barrido de entregables próximos/vencidos, de
    cumpleaños próximos y de reuniones de hoy, y genera notificaciones. En
    producción esto se debe correr con un scheduler (ver
    app/services/recordatorios.py).
    """
    total_entregables = generar_recordatorios(db)
    total_cumpleanos = generar_recordatorios_cumpleanos(db)
    total_reuniones = generar_recordatorios_reuniones_hoy(db)
    return {
        "notificaciones_creadas": total_entregables + total_cumpleanos + total_reuniones,
        "notificaciones_entregables": total_entregables,
        "notificaciones_cumpleanos": total_cumpleanos,
        "notificaciones_reuniones": total_reuniones,
    }

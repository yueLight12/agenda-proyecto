"""
Endpoints administrativos de utilidad para el MVP/pruebas.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import obtener_usuario_actual
from app.models.usuario import Usuario
from app.services.recordatorios import generar_recordatorios

router = APIRouter(prefix="/admin", tags=["Administración"])


@router.post("/generar-recordatorios")
def disparar_generacion_recordatorios(
    db: Session = Depends(get_db), usuario: Usuario = Depends(obtener_usuario_actual)
):
    """
    Dispara manualmente el barrido de entregables próximos/vencidos y genera
    notificaciones. En producción esto se debe correr con un scheduler
    (ver app/services/recordatorios.py).
    """
    total = generar_recordatorios(db)
    return {"notificaciones_creadas": total}

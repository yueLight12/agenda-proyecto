"""
Router de integración con Power Automate Desktop -- la laptop de Yue
consultaría aquí los correos pendientes de la bandeja de salida
(app/models/correo_pendiente.py) y los marcaría como enviados después de
mandarlos desde Outlook de escritorio. Ver app/services/email_cliente.py.

INACTIVO desde 2026-08-24: NO registrado en app/main.py -- se pausó por
un problema de Outlook de escritorio en la laptop de Yue antes de
terminar la prueba (ver app/services/email_cliente.py para el historial
completo de intentos de correo). Se deja el código completo, listo para
retomar si se resuelve.

No usa el login normal (JWT) porque quien llama no es un usuario del
sistema, sino el flujo de escritorio -- se protege con una clave fija
simple en el header X-Api-Key (INTEGRACION_CORREO_API_KEY en .env).
"""
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.database import get_db
from app.models.correo_pendiente import CorreoPendiente
from app.schemas.correo_pendiente import CorreoPendienteOut

router = APIRouter(prefix="/integraciones", tags=["Integraciones"])


def _validar_api_key(x_api_key: str = Header(default="")) -> None:
    if not settings.integracion_correo_api_key or x_api_key != settings.integracion_correo_api_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Clave inválida")


@router.get("/correos-pendientes", response_model=List[CorreoPendienteOut])
def listar_correos_pendientes(
    db: Session = Depends(get_db),
    _: None = Depends(_validar_api_key),
):
    """Correos aún no marcados como enviados, más antiguos primero."""
    return (
        db.query(CorreoPendiente)
        .filter(CorreoPendiente.enviado.is_(False))
        .order_by(CorreoPendiente.fecha_creacion.asc())
        .all()
    )


@router.post("/correos-pendientes/{correo_id}/marcar-enviado")
def marcar_correo_enviado(
    correo_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(_validar_api_key),
):
    correo = db.query(CorreoPendiente).filter(CorreoPendiente.id == correo_id).first()
    if not correo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Correo no encontrado")
    correo.enviado = True
    correo.fecha_enviado = datetime.utcnow()
    db.commit()
    return {"ok": True}

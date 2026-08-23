"""
Router de suscripción a notificaciones push del navegador (Web Push,
VAPID) -- ver app/services/push.py para el envío en sí y
app/models/suscripcion_push.py para el modelo.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.config import settings
from app.database import get_db
from app.dependencies import obtener_usuario_actual
from app.models.suscripcion_push import SuscripcionPush
from app.models.usuario import Usuario
from app.schemas.push import SuscripcionPushCrear, SuscripcionPushEliminar

router = APIRouter(prefix="/push", tags=["Notificaciones push"])


@router.get("/vapid-public-key")
def obtener_llave_publica():
    """La llave pública VAPID es la única credencial que el frontend
    necesita para suscribirse (pushManager.subscribe) -- la privada nunca
    sale del backend."""
    return {"vapid_public_key": settings.vapid_public_key}


@router.post("/suscribir", status_code=201)
def suscribir(
    datos: SuscripcionPushCrear,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """Da de alta (o actualiza si el endpoint ya existía, ej. el mismo
    navegador reactivando notificaciones) la suscripción de este
    usuario/dispositivo."""
    existente = (
        db.query(SuscripcionPush).filter(SuscripcionPush.endpoint == datos.endpoint).first()
    )
    if existente:
        existente.usuario_id = usuario.id
        existente.p256dh = datos.p256dh
        existente.auth = datos.auth
    else:
        db.add(
            SuscripcionPush(
                usuario_id=usuario.id,
                endpoint=datos.endpoint,
                p256dh=datos.p256dh,
                auth=datos.auth,
            )
        )
    db.commit()
    return {"ok": True}


@router.delete("/suscribir", status_code=204)
def desuscribir(
    datos: SuscripcionPushEliminar,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """Da de baja la suscripción de este endpoint (ej. el usuario
    desactivó notificaciones desde el navegador)."""
    db.query(SuscripcionPush).filter(
        SuscripcionPush.endpoint == datos.endpoint,
        SuscripcionPush.usuario_id == usuario.id,
    ).delete()
    db.commit()

"""
Router de notificaciones (recordatorios dentro de la app).

La generación automática de recordatorios (revisar fechas próximas a vencer
y crear notificaciones) se hace en app/services/recordatorios.py, pensado
para correr como tarea periódica (cron / scheduler). Este router solo expone
lectura y marcado de leídas.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import obtener_usuario_actual
from app.models.notificacion import Notificacion
from app.models.usuario import Usuario
from app.schemas.notificacion import NotificacionOut

router = APIRouter(prefix="/notificaciones", tags=["Notificaciones"])


@router.get("", response_model=list[NotificacionOut])
def listar_mis_notificaciones(
    solo_no_leidas: bool = False,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    query = db.query(Notificacion).filter(Notificacion.usuario_id == usuario.id)
    if solo_no_leidas:
        query = query.filter(Notificacion.leida.is_(False))
    return query.order_by(Notificacion.fecha_creacion.desc()).all()


@router.patch("/{notificacion_id}", response_model=NotificacionOut)
def marcar_como_leida(
    notificacion_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    notificacion = (
        db.query(Notificacion)
        .filter(Notificacion.id == notificacion_id, Notificacion.usuario_id == usuario.id)
        .first()
    )
    if not notificacion:
        raise HTTPException(status_code=404, detail="Notificación no encontrada")

    notificacion.leida = True
    db.commit()
    db.refresh(notificacion)
    return notificacion

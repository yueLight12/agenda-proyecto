"""
Router de notificaciones (recordatorios dentro de la app).

La generación automática de recordatorios (revisar fechas próximas a vencer
y crear notificaciones) se hace en app/services/recordatorios.py, pensado
para correr como tarea periódica (cron / scheduler). Este router expone
lectura, marcado de leídas y eliminación.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import obtener_usuario_actual
from app.models.entregable import Entregable
from app.models.notificacion import Notificacion
from app.models.reunion import Reunion
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
    # Urgentes primero (2026-08-20, a petición del cliente: "lo primero
    # que se ve"), luego más recientes primero (comportamiento de siempre).
    notificaciones = query.order_by(
        Notificacion.urgente.desc(), Notificacion.fecha_creacion.desc()
    ).all()

    # proyecto_id resuelto en batch (2026-08-21, reporte real de Yue: una
    # notificación de "te asignaron X" no era clickeable ni tenía botón de
    # marcar concluido como las demás filas de "Pendientes" en Agenda Plan
    # B, porque le faltaba el proyecto_id para armar el link) -- Notificacion
    # no tiene relación ORM a Entregable/Reunion, solo el FK crudo, así que
    # se resuelve aquí con 2 queries (no N+1: una sola consulta por tipo,
    # sin importar cuántas notificaciones haya).
    ids_entregable = {n.entregable_id for n in notificaciones if n.entregable_id}
    ids_reunion = {n.reunion_id for n in notificaciones if n.reunion_id}
    proyecto_por_entregable = (
        dict(
            db.query(Entregable.id, Entregable.proyecto_id)
            .filter(Entregable.id.in_(ids_entregable))
            .all()
        )
        if ids_entregable
        else {}
    )
    proyecto_por_reunion = (
        dict(
            db.query(Reunion.id, Reunion.proyecto_id)
            .filter(Reunion.id.in_(ids_reunion))
            .all()
        )
        if ids_reunion
        else {}
    )

    resultado = []
    for n in notificaciones:
        salida = NotificacionOut.model_validate(n)
        if n.entregable_id:
            salida.proyecto_id = proyecto_por_entregable.get(n.entregable_id)
        elif n.reunion_id:
            salida.proyecto_id = proyecto_por_reunion.get(n.reunion_id)
        resultado.append(salida)
    return resultado


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


@router.delete("/{notificacion_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_notificacion(
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

    db.delete(notificacion)
    db.commit()

"""
Servicio de generación de recordatorios in-app.

En el MVP esto se ejecuta manualmente vía el endpoint
POST /admin/generar-recordatorios (pensado para probar el flujo), pero está
escrito para poder colgarse de un scheduler (APScheduler, cron, Celery beat,
o un trigger en AWS/Lambda cuando se migre) sin cambiar la lógica.

Regla: se genera una notificación cuando faltan `dias_alerta_entregable` días
o menos para la fecha de entrega (y no está cumplido), y otra si ya venció.
Evita duplicar notificaciones del mismo tipo el mismo día para el mismo entregable.
"""
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.entregable import Entregable, EstatusEntregable
from app.models.notificacion import Notificacion, TipoNotificacion


def _ya_existe_notificacion_hoy(
    db: Session, usuario_id: int, entregable_id: int, tipo: TipoNotificacion
) -> bool:
    hoy = date.today()
    return (
        db.query(Notificacion)
        .filter(
            Notificacion.usuario_id == usuario_id,
            Notificacion.entregable_id == entregable_id,
            Notificacion.tipo == tipo,
            Notificacion.fecha_creacion >= hoy,
        )
        .first()
        is not None
    )


def generar_recordatorios(db: Session) -> int:
    """Revisa todos los entregables pendientes y genera notificaciones. Devuelve el total creadas."""
    hoy = date.today()
    limite = hoy + timedelta(days=settings.dias_alerta_entregable)

    pendientes = (
        db.query(Entregable)
        .filter(Entregable.estatus != EstatusEntregable.cumplido)
        .all()
    )

    creadas = 0
    for entregable in pendientes:
        destinatario_id = entregable.responsable_id

        if entregable.fecha_entrega < hoy:
            tipo = TipoNotificacion.recordatorio_vencido
            mensaje = f'El entregable "{entregable.nombre}" está VENCIDO (fecha límite: {entregable.fecha_entrega}).'
        elif entregable.fecha_entrega <= limite:
            tipo = TipoNotificacion.recordatorio_proximo
            dias_restantes = (entregable.fecha_entrega - hoy).days
            mensaje = f'El entregable "{entregable.nombre}" vence en {dias_restantes} día(s) ({entregable.fecha_entrega}).'
        else:
            continue

        if _ya_existe_notificacion_hoy(db, destinatario_id, entregable.id, tipo):
            continue

        db.add(
            Notificacion(
                usuario_id=destinatario_id,
                entregable_id=entregable.id,
                tipo=tipo,
                mensaje=mensaje,
            )
        )
        creadas += 1

    db.commit()
    return creadas

"""
Servicio de generación de recordatorios in-app.

En el MVP esto se ejecuta manualmente vía el endpoint
POST /admin/generar-recordatorios (pensado para probar el flujo), pero está
escrito para poder colgarse de un scheduler (APScheduler, cron, Celery beat,
o un trigger en AWS/Lambda cuando se migre) sin cambiar la lógica.

Regla (entregables): se genera una notificación cuando faltan
`dias_alerta_entregable` días o menos para la fecha de entrega (y no está
cumplido), y otra si ya venció. Evita duplicar notificaciones del mismo
tipo el mismo día para el mismo entregable.

Regla (cumpleaños): se notifica a TODOS los usuarios activos (no solo al
responsable de algo, es informativo para todo el equipo) cuando el
cumpleaños de alguien cargado en EventoEmpresa cae en 2 días, en 1 día, o
es hoy — evita duplicar por (usuario, evento, día) vía evento_empresa_id.

Regla (reuniones de hoy): se notifica al organizador y a cada invitado de
las reuniones cuya fecha_inicio cae hoy — evita duplicar por (usuario,
reunión, día) vía reunion_id.
"""
from datetime import date, datetime, time, timedelta

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.entregable import Entregable, EstatusEntregable
from app.models.evento_empresa import EventoEmpresa, TipoEventoEmpresa
from app.models.notificacion import Notificacion, TipoNotificacion
from app.models.reunion import Reunion
from app.models.usuario import Usuario
from app.models.usuario_proyecto_rol import UsuarioProyectoRol
from app.services.eventos_empresa import proxima_ocurrencia


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
    """
    Revisa todos los entregables pendientes y genera notificaciones para el
    responsable Y, si tiene uno, su supervisor en ese proyecto (para que un
    N1/N2 se entere de los vencidos/próximos de su equipo sin depender de
    entrar al tablero) — mismo criterio de "supervisor_id" que usa
    permissions.py, no una regla de visibilidad nueva. Devuelve el total
    de notificaciones creadas.
    """
    hoy = date.today()
    limite = hoy + timedelta(days=settings.dias_alerta_entregable)

    pendientes = (
        db.query(Entregable)
        .filter(Entregable.estatus != EstatusEntregable.cumplido)
        .all()
    )

    creadas = 0
    for entregable in pendientes:
        if entregable.fecha_entrega < hoy:
            tipo = TipoNotificacion.recordatorio_vencido
            mensaje_propio = f'El entregable "{entregable.nombre}" está VENCIDO (fecha límite: {entregable.fecha_entrega}).'
            mensaje_supervisor = (
                f'El entregable "{entregable.nombre}" de {entregable.responsable.nombre} '
                f"está VENCIDO (fecha límite: {entregable.fecha_entrega})."
            )
        elif entregable.fecha_entrega <= limite:
            tipo = TipoNotificacion.recordatorio_proximo
            dias_restantes = (entregable.fecha_entrega - hoy).days
            mensaje_propio = f'El entregable "{entregable.nombre}" vence en {dias_restantes} día(s) ({entregable.fecha_entrega}).'
            mensaje_supervisor = (
                f'El entregable "{entregable.nombre}" de {entregable.responsable.nombre} '
                f"vence en {dias_restantes} día(s) ({entregable.fecha_entrega})."
            )
        else:
            continue

        destinatarios = {entregable.responsable_id: mensaje_propio}

        rol_responsable = (
            db.query(UsuarioProyectoRol)
            .filter(
                UsuarioProyectoRol.usuario_id == entregable.responsable_id,
                UsuarioProyectoRol.proyecto_id == entregable.proyecto_id,
            )
            .first()
        )
        if rol_responsable and rol_responsable.supervisor_id:
            destinatarios.setdefault(rol_responsable.supervisor_id, mensaje_supervisor)

        for destinatario_id, mensaje in destinatarios.items():
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


def _ya_existe_notificacion_cumpleanos_hoy(db: Session, usuario_id: int, evento_id: int) -> bool:
    hoy = date.today()
    return (
        db.query(Notificacion)
        .filter(
            Notificacion.usuario_id == usuario_id,
            Notificacion.evento_empresa_id == evento_id,
            Notificacion.fecha_creacion >= hoy,
        )
        .first()
        is not None
    )


def _mensaje_cumpleanos(nombre: str, dias_restantes: int) -> str | None:
    if dias_restantes == 0:
        return f"🎂 ¡Hoy es el cumpleaños de {nombre}!"
    if dias_restantes == 1:
        return f"🎂 Mañana es el cumpleaños de {nombre}."
    if dias_restantes == 2:
        return f"🎂 En 2 días es el cumpleaños de {nombre}."
    return None


def generar_recordatorios_cumpleanos(db: Session) -> int:
    """
    Notifica a todos los usuarios activos los cumpleaños que caen en 2
    días, en 1 día, o hoy. Devuelve el total de notificaciones creadas.
    """
    hoy = date.today()
    eventos = db.query(EventoEmpresa).filter(EventoEmpresa.tipo == TipoEventoEmpresa.cumpleanos).all()
    usuarios_activos = db.query(Usuario).filter(Usuario.activo.is_(True)).all()

    creadas = 0
    for evento in eventos:
        dias_restantes = (proxima_ocurrencia(evento.fecha, hoy) - hoy).days
        mensaje = _mensaje_cumpleanos(evento.nombre, dias_restantes)
        if mensaje is None:
            continue

        for usuario in usuarios_activos:
            if _ya_existe_notificacion_cumpleanos_hoy(db, usuario.id, evento.id):
                continue
            db.add(
                Notificacion(
                    usuario_id=usuario.id,
                    evento_empresa_id=evento.id,
                    tipo=TipoNotificacion.otro,
                    mensaje=mensaje,
                )
            )
            creadas += 1

    db.commit()
    return creadas


def _ya_existe_notificacion_reunion_hoy(db: Session, usuario_id: int, reunion_id: int) -> bool:
    hoy = date.today()
    return (
        db.query(Notificacion)
        .filter(
            Notificacion.usuario_id == usuario_id,
            Notificacion.reunion_id == reunion_id,
            Notificacion.tipo == TipoNotificacion.reunion_hoy,
            Notificacion.fecha_creacion >= hoy,
        )
        .first()
        is not None
    )


def generar_recordatorios_reuniones_hoy(db: Session) -> int:
    """
    Notifica al organizador y a cada invitado de las reuniones cuya
    fecha_inicio cae hoy. Devuelve el total de notificaciones creadas.
    """
    hoy = date.today()
    inicio_dia = datetime.combine(hoy, time.min)
    fin_dia = datetime.combine(hoy, time.max)

    reuniones_hoy = (
        db.query(Reunion)
        .filter(Reunion.fecha_inicio >= inicio_dia, Reunion.fecha_inicio <= fin_dia)
        .all()
    )

    creadas = 0
    for reunion in reuniones_hoy:
        hora = reunion.fecha_inicio.strftime("%H:%M")
        mensaje = f'Hoy a las {hora} es la reunión "{reunion.titulo}".'
        destinatarios = {reunion.organizador_id} | {p.usuario_id for p in reunion.participantes}

        for destinatario_id in destinatarios:
            if _ya_existe_notificacion_reunion_hoy(db, destinatario_id, reunion.id):
                continue
            db.add(
                Notificacion(
                    usuario_id=destinatario_id,
                    reunion_id=reunion.id,
                    tipo=TipoNotificacion.reunion_hoy,
                    mensaje=mensaje,
                )
            )
            creadas += 1

    db.commit()
    return creadas

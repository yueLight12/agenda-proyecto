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
from app.services.notificaciones import crear_notificacion
from app.services.whatsapp import enviar_whatsapp


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

    Además de la notificación in-app/push, manda WhatsApp con el mismo
    mensaje (2026-09-14, a petición de Yue: antes el WhatsApp de un
    entregable solo se mandaba UNA vez, al crear/reasignar -- si la
    persona ignoraba esa notificación, nunca más le llegaba nada por
    WhatsApp aunque la tarea siguiera vencida o por vencer). Se reusa la
    misma deduplicación por día que ya tiene la notificación in-app
    (_ya_existe_notificacion_hoy), así que llega como mucho una vez por
    día por entregable mientras no se marque cumplido -- no es spam por
    cada barrido de 6h, es un recordatorio diario que SÍ se repite día
    tras día hasta que se resuelva.
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

            crear_notificacion(db, destinatario_id, tipo, mensaje, entregable_id=entregable.id)
            enviar_whatsapp(db, destinatario_id, mensaje)
            creadas += 1

    db.commit()
    return creadas


def _ya_existe_notificacion_reciente(
    db: Session, usuario_id: int, entregable_id: int, tipo: TipoNotificacion, horas: int
) -> bool:
    limite = datetime.utcnow() - timedelta(hours=horas)
    return (
        db.query(Notificacion)
        .filter(
            Notificacion.usuario_id == usuario_id,
            Notificacion.entregable_id == entregable_id,
            Notificacion.tipo == tipo,
            Notificacion.fecha_creacion >= limite,
        )
        .first()
        is not None
    )


def generar_recordatorios_urgentes_hoy(db: Session) -> int:
    """
    Refuerzo de recordatorios (2026-09-14, a petición de Yue) para
    entregables que vencen HOY y siguen sin cumplirse: a diferencia de
    generar_recordatorios (una notificación por día, sea cual sea la
    urgencia), este insiste con MAYOR frecuencia -- cada
    settings.horas_entre_recordatorios_urgentes horas -- solo mientras
    quede el mismo día para resolverlo. Deja de insistir solo cuando el
    entregable se marca cumplido (deja de aparecer en la consulta) o
    cuando cambia la fecha (ya no "vence hoy"). Mismos destinatarios
    (responsable + supervisor) y mismos canales (in-app, push, WhatsApp)
    que generar_recordatorios -- pensado para correr en un job de
    scheduler aparte y más frecuente (ver app/main.py).
    """
    hoy = date.today()

    entregables_hoy = (
        db.query(Entregable)
        .filter(
            Entregable.estatus != EstatusEntregable.cumplido,
            Entregable.fecha_entrega == hoy,
        )
        .all()
    )

    creadas = 0
    for entregable in entregables_hoy:
        mensaje_propio = f'URGENTE: el entregable "{entregable.nombre}" vence HOY ({entregable.fecha_entrega}) y sigue pendiente.'
        mensaje_supervisor = (
            f'URGENTE: el entregable "{entregable.nombre}" de {entregable.responsable.nombre} '
            f"vence HOY ({entregable.fecha_entrega}) y sigue pendiente."
        )
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
            if _ya_existe_notificacion_reciente(
                db,
                destinatario_id,
                entregable.id,
                TipoNotificacion.recordatorio_vencido,
                settings.horas_entre_recordatorios_urgentes,
            ):
                continue

            crear_notificacion(
                db,
                destinatario_id,
                TipoNotificacion.recordatorio_vencido,
                mensaje,
                entregable_id=entregable.id,
                urgente=True,
            )
            enviar_whatsapp(db, destinatario_id, mensaje)
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
            crear_notificacion(
                db, usuario.id, TipoNotificacion.otro, mensaje, evento_empresa_id=evento.id
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


def expirar_recordatorios_reuniones_hoy(db: Session) -> int:
    """Fix real (2026-09-17, reporte de Yue: en "Pendientes / Por hacer"
    varias reuniones distintas decían "Hoy a las X" al mismo tiempo, con
    horas que no correspondían al día real). Causa: el mensaje de
    reunion_hoy graba "Hoy a las X" como texto fijo al crearse, y esa
    notificación nunca se marcaba leída sola una vez pasado ese día -- para
    una reunión recurrente, cada ocurrencia pasada deja su propia
    notificación pegada con un "Hoy" que ya es falso, acumulándose sin
    límite. Se marcan leídas aquí las de tipo reunion_hoy cuya
    fecha_creacion no es de hoy, ANTES de generar las nuevas del día --
    ver la llamada en app/main.py, mismo barrido. Devuelve cuántas se
    expiraron."""
    hoy = date.today()
    inicio_dia = datetime.combine(hoy, time.min)

    pendientes = (
        db.query(Notificacion)
        .filter(
            Notificacion.tipo == TipoNotificacion.reunion_hoy,
            Notificacion.leida.is_(False),
            Notificacion.fecha_creacion < inicio_dia,
        )
        .all()
    )
    for notificacion in pendientes:
        notificacion.leida = True

    db.commit()
    return len(pendientes)


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
            crear_notificacion(
                db, destinatario_id, TipoNotificacion.reunion_hoy, mensaje, reunion_id=reunion.id
            )
            creadas += 1

    db.commit()
    return creadas


def _ya_existe_notificacion_recordatorio_reunion(
    db: Session, usuario_id: int, reunion_id: int
) -> bool:
    """A diferencia de reunion_hoy (una por día), el recordatorio con
    antelación es de una sola vez por reunión -- no se acota por fecha."""
    return (
        db.query(Notificacion)
        .filter(
            Notificacion.usuario_id == usuario_id,
            Notificacion.reunion_id == reunion_id,
            Notificacion.tipo == TipoNotificacion.recordatorio_reunion,
        )
        .first()
        is not None
    )


def generar_recordatorios_previos_reuniones(db: Session) -> int:
    """
    Recordatorio configurable por reunión (Reunion.recordatorio_minutos_antes,
    2026-08-25, a petición de Yue) -- distinto de generar_recordatorios_reuniones_hoy
    (esa es fija, "el mismo día", sin importar la hora). Notifica al
    organizador y a cada invitado UNA sola vez, cuando `ahora` entra a la
    ventana [fecha_inicio - recordatorio_minutos_antes, fecha_inicio).

    Precisión (2026-09-18, resuelto): corre en su PROPIO barrido del
    scheduler, cada settings.minutos_entre_barridos_recordatorios_reuniones
    (5 min por default) -- ver _ejecutar_barrido_recordatorios_previos_reuniones
    en app/main.py, separado del barrido general de
    settings.horas_entre_barridos_recordatorios (ese sigue en horas, no
    necesita ser preciso al minuto). Antes ambos corrían juntos en el
    barrido general de hasta 6h, así que un "15 min antes" podía llegar
    tarde o nunca a tiempo.
    """
    ahora = datetime.utcnow()

    reuniones = (
        db.query(Reunion)
        .filter(
            Reunion.recordatorio_minutos_antes.isnot(None),
            Reunion.fecha_inicio > ahora,
        )
        .all()
    )

    creadas = 0
    for reunion in reuniones:
        momento_recordatorio = reunion.fecha_inicio - timedelta(
            minutes=reunion.recordatorio_minutos_antes
        )
        if ahora < momento_recordatorio:
            continue  # todavía no es momento de avisar

        mensaje = (
            f'Recordatorio: la reunión "{reunion.titulo}" es el '
            f'{reunion.fecha_inicio.strftime("%d/%m/%Y a las %H:%M")}.'
        )
        destinatarios = {reunion.organizador_id} | {p.usuario_id for p in reunion.participantes}

        for destinatario_id in destinatarios:
            if _ya_existe_notificacion_recordatorio_reunion(db, destinatario_id, reunion.id):
                continue
            crear_notificacion(
                db,
                destinatario_id,
                TipoNotificacion.recordatorio_reunion,
                mensaje,
                reunion_id=reunion.id,
            )
            creadas += 1

    db.commit()
    return creadas

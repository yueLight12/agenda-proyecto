"""
Servicio de entregables: crear, editar y actualizar avance. Usado por los
routers REST (app/routers/entregables.py, app/routers/minutas.py) y por el
asistente de voz (app/services/asistente/), para no duplicar reglas de
permisos ni notificaciones entre ambos caminos.
"""
from datetime import date, timedelta

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.permissions import (
    obtener_rol_en_proyecto,
    obtener_rol_local_en_proyecto,
    puede_actualizar_avance_entregable,
    puede_administrar_entregable,
    puede_aprobar_rechazar_entregable,
    puede_editar_entregable,
    puede_reasignar_entregable,
    requerir_participacion_en_proyecto,
    requerir_rol_minimo,
)
from app.models.entregable import Entregable, EstatusEntregable
from app.models.historial_avance import HistorialAvance
from app.models.historial_responsable import HistorialResponsable
from app.models.minuta import AcuerdoMinuta
from app.models.notificacion import Notificacion, TipoNotificacion
from app.models.usuario import RolEnum, Usuario
from app.models.usuario_proyecto_rol import UsuarioProyectoRol
from app.schemas.entregable import EntregableOut
from app.schemas.nota import NotaCrear
from app.services.almacenamiento import eliminar_imagen, guardar_imagen
from app.services.avisos_acceso import avisar_si_nunca_ha_entrado
from app.services.contenido_sensible import verificar_contenido
from app.services.notificaciones import crear_notificacion
from app.services.proyectos import es_lider_en_algun_tema
from app.services.push import enviar_push
from app.services.whatsapp import enviar_whatsapp

# Días de anticipación para que un entregable sea "urgente" solo por
# fecha, sin que nadie lo haya marcado a mano (2026-08-20, a petición del
# cliente, confirmado con Yue: 3 días).
DIAS_URGENTE_POR_VENCER = 3


def es_urgente(entregable: Entregable) -> bool:
    """Urgencia COMBINADA: manual (Entregable.urgente_manual) OR ya
    vencido OR vence en DIAS_URGENTE_POR_VENCER días o menos. Un
    entregable cumplido nunca es urgente, sin importar la fecha o la
    marca manual -- ya no hay nada pendiente que resolver."""
    if entregable.estatus == EstatusEntregable.cumplido:
        return False
    if entregable.urgente_manual:
        return True
    dias_para_vencer = (entregable.fecha_entrega - date.today()).days
    return dias_para_vencer <= DIAS_URGENTE_POR_VENCER


def _notificacion_vista_de_asignacion(db: Session, usuario: Usuario, entregable: Entregable):
    """"Acuse de vista" (2026-09-17) -- devuelve (vista, fecha) de la
    notificación de asignación de `entregable` para su responsable actual,
    o (None, None) si quien pregunta no tiene permiso para saberlo (mismo
    público que "Visto bueno": el creador o N1/N2 del tema, nunca el
    propio responsable) o si esa tarea nunca generó esa notificación (ej.
    autoasignada)."""
    if not puede_aprobar_rechazar_entregable(db, usuario, entregable):
        return None, None
    notificacion = (
        db.query(Notificacion)
        .filter(
            Notificacion.entregable_id == entregable.id,
            Notificacion.usuario_id == entregable.responsable_id,
            Notificacion.tipo == TipoNotificacion.entregable_asignado,
        )
        .order_by(Notificacion.fecha_creacion.desc())
        .first()
    )
    if not notificacion:
        return None, None
    return notificacion.leida, notificacion.fecha_leida


def entregable_a_out(db: Session, usuario: Usuario, entregable: Entregable) -> EntregableOut:
    notificacion_vista, notificacion_vista_fecha = _notificacion_vista_de_asignacion(
        db, usuario, entregable
    )
    return EntregableOut(
        id=entregable.id,
        proyecto_id=entregable.proyecto_id,
        nombre=entregable.nombre,
        descripcion=entregable.descripcion,
        responsable_id=entregable.responsable_id,
        fecha_entrega=entregable.fecha_entrega,
        sensible=entregable.sensible,
        urgente_manual=entregable.urgente_manual,
        porcentaje_avance=entregable.porcentaje_avance,
        estatus=entregable.estatus,
        creado_por=entregable.creado_por,
        fecha_creacion=entregable.fecha_creacion,
        orden=entregable.orden,
        puede_editar=puede_editar_entregable(db, usuario, entregable),
        puede_administrar=puede_administrar_entregable(db, usuario, entregable),
        urgente=es_urgente(entregable),
        puede_reasignar=puede_reasignar_entregable(db, usuario, entregable),
        puede_aprobar=puede_aprobar_rechazar_entregable(db, usuario, entregable),
        requiere_comprobante=entregable.requiere_comprobante,
        tiene_comprobante=entregable.comprobante_path is not None,
        responsable_nombre=entregable.responsable.nombre if entregable.responsable else "",
        notificacion_vista=notificacion_vista,
        notificacion_vista_fecha=notificacion_vista_fecha,
    )


def _siguiente_orden_entregable(db: Session, proyecto_id: int) -> int:
    maximo = (
        db.query(Entregable.orden)
        .filter(Entregable.proyecto_id == proyecto_id)
        .order_by(Entregable.orden.desc())
        .first()
    )
    return (maximo[0] if maximo else 0) + 1


def _texto_urgencia(urgente: bool) -> str:
    # "de carácter urgente/no urgente" -- texto pedido explícitamente por
    # el cliente (2026-08-20) para la notificación de asignación. Debe
    # reflejar la urgencia COMBINADA (mismo criterio que el badge visual y
    # que Notificacion.urgente, ver es_urgente()), no solo la marca manual
    # -- corregido el 2026-08-20 tras un reporte real de Yue: un entregable
    # sin marcar a mano pero que vencía al día siguiente decía "de carácter
    # no urgente" en el texto mientras el badge de la misma notificación
    # SÍ mostraba "URGENTE" (por estar dentro de DIAS_URGENTE_POR_VENCER) --
    # contradicción confusa entre texto y badge de un mismo aviso.
    return "de carácter urgente" if urgente else "de carácter no urgente"


def mensaje_whatsapp_asignacion(asignador_nombre: str, entregable: "Entregable") -> str:
    """Texto único de "te asignaron una tarea" por WhatsApp (2026-09-03, a
    petición de Yue: que el mensaje traiga quién asigna, tarea, fecha,
    hora, si es urgente, si requiere comprobante, el link a la app, y la
    forma de marcarla como concluida sin abrir la app). Compartido entre
    TODOS los caminos que asignan una tarea -- crear_entregable, reasignar
    (ambos en este archivo) y el webhook de WhatsApp (asignar por
    WhatsApp, ver app/routers/whatsapp_webhook.py) -- para que el mensaje
    se vea igual sin importar desde dónde se creó la tarea."""
    urgente = es_urgente(entregable)
    lineas = [
        f'📌 {asignador_nombre} te asignó una tarea nueva:',
        f'"{entregable.nombre}"',
        (
            f"Fecha límite: {entregable.fecha_entrega.strftime('%d/%m/%Y')}"
            + (f" a las {entregable.hora_entrega.strftime('%H:%M')}" if entregable.hora_entrega else "")
        ),
        f'Urgente: {"Sí" if urgente else "No"}',
    ]
    if entregable.requiere_comprobante:
        lineas.append("Requiere comprobante: Sí")
    lineas.append(f"Cuando la termines, respóndeme aquí: LISTO #{entregable.id}")
    if settings.url_app:
        lineas.append(f"Revísala en la app: {settings.url_app}")
    return "\n".join(lineas)


def _notificar_supervisor_de_asignacion(
    db: Session, asignador: Usuario, responsable: Usuario, entregable: Entregable
) -> None:
    """Avisa al supervisor REAL del responsable cuando quien asignó la tarea
    es otra persona (2026-08-26, a petición de Yue: caso real Bernardo, que
    puede asignar a cualquiera, le asigna algo a Juan José sin que David --
    supervisor real de Juan José -- se entere).

    El supervisor NO se busca solo en el proyecto de este entregable
    (2026-08-26, bug real encontrado en pruebas: la tarea quedó en "Tareas
    sueltas", el tema personal del responsable, donde nadie tiene
    supervisor_id propio -- ahí "David es el supervisor de Juan José" seguía
    siendo cierto en la vida real, solo que no en ESE tema puntual) -- se
    busca en CUALQUIER tema donde el responsable tenga un supervisor_id real,
    y si no hay ninguno, en la plantilla de "Mi equipo" de alguien que lo
    tenga guardado (mismo criterio que ya usa
    equipos.rol_default_para_nuevo_proyecto). Si el supervisor encontrado es
    justo quien asignó, o no hay ninguno (ej. un N2 que no reporta a nadie
    más), no hay nada que avisar. No dispara push/WhatsApp (a diferencia de
    la notificación al responsable) para no duplicar el aviso urgente --
    esto es solo "entérate", no una tarea propia."""
    rol_responsable = obtener_rol_en_proyecto(db, responsable.id, entregable.proyecto_id)
    supervisor_id = rol_responsable.supervisor_id if rol_responsable else None

    if not supervisor_id:
        otro_rol_con_supervisor = (
            db.query(UsuarioProyectoRol)
            .filter(
                UsuarioProyectoRol.usuario_id == responsable.id,
                UsuarioProyectoRol.supervisor_id.isnot(None),
            )
            .order_by(UsuarioProyectoRol.id)
            .first()
        )
        supervisor_id = otro_rol_con_supervisor.supervisor_id if otro_rol_con_supervisor else None

    if not supervisor_id:
        from app.models.equipo_miembro import EquipoMiembro

        plantilla_de = (
            db.query(EquipoMiembro)
            .filter(EquipoMiembro.usuario_id == responsable.id)
            .order_by(EquipoMiembro.id)
            .first()
        )
        supervisor_id = plantilla_de.propietario_id if plantilla_de else None

    if not supervisor_id or supervisor_id == asignador.id:
        return
    crear_notificacion(
        db,
        supervisor_id,
        TipoNotificacion.entregable_asignado,
        (
            f"{asignador.nombre} le asignó a {responsable.nombre} la tarea "
            f'"{entregable.nombre}", con fecha de entrega {entregable.fecha_entrega} '
            f"({_texto_dias_restantes(entregable.fecha_entrega)})."
        ),
        entregable_id=entregable.id,
    )


def _texto_dias_restantes(fecha_entrega: date) -> str:
    """Texto legible de cuánto falta/pasó para la fecha límite (2026-08-21,
    a petición de Yue para reformular el texto de las notificaciones de
    asignación). No confundir con _texto_urgencia (esa habla de la marca
    urgente/no urgente combinada; esta habla de los días concretos)."""
    dias = (fecha_entrega - date.today()).days
    if dias > 0:
        return f"vence en {dias} día" if dias == 1 else f"vence en {dias} días"
    if dias == 0:
        return "vence hoy"
    dias_abs = abs(dias)
    return (
        f"venció hace {dias_abs} día" if dias_abs == 1 else f"venció hace {dias_abs} días"
    )


def crear_entregable(
    db: Session,
    proyecto_id: int,
    usuario: Usuario,
    rol: UsuarioProyectoRol,
    nombre: str,
    descripcion: str | None,
    responsable_id: int,
    fecha_entrega,
    sensible: bool,
    urgente_manual: bool = False,
    requiere_comprobante: bool = False,
    hora_entrega=None,
) -> Entregable:
    """
    N1/N2 pueden crear y asignar a cualquiera de su equipo. N3/N4 solo pueden
    autoasignarse (responsable_id == usuario.id). Notifica al responsable si
    lo asigna un líder, o al supervisor si es autoasignación.
    """
    es_lider = rol.rol in (RolEnum.N1, RolEnum.N2)
    if not es_lider and responsable_id != usuario.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo puedes crear entregables asignados a ti mismo",
        )

    verificar_contenido(db, usuario, "entregable", nombre=nombre, descripcion=descripcion)

    nuevo = Entregable(
        proyecto_id=proyecto_id,
        nombre=nombre,
        descripcion=descripcion,
        responsable_id=responsable_id,
        fecha_entrega=fecha_entrega,
        hora_entrega=hora_entrega,
        sensible=sensible,
        urgente_manual=urgente_manual,
        requiere_comprobante=requiere_comprobante,
        creado_por=usuario.id,
        orden=_siguiente_orden_entregable(db, proyecto_id),
    )
    db.add(nuevo)
    db.flush()  # para tener nuevo.id antes de crear la notificación

    # Historial de responsable (2026-08-23, ver query_entregables_visibles):
    # registra al responsable ORIGINAL -- necesario para que quien lo creó
    # (aunque no sea supervisor directo del responsable actual tras una
    # futura reasignación) siga viéndolo por haber estado en la cadena.
    db.add(HistorialResponsable(entregable_id=nuevo.id, usuario_id=responsable_id))

    if es_lider and responsable_id != usuario.id:
        urgencia_combinada = es_urgente(nuevo)
        # push=False: el título/cuerpo de abajo tienen más contexto que el
        # genérico de crear_notificacion (2026-08-26).
        crear_notificacion(
            db,
            responsable_id,
            TipoNotificacion.entregable_asignado,
            (
                f'Se te asignó "{nuevo.nombre}", por {usuario.nombre}, con fecha de '
                f"entrega {nuevo.fecha_entrega} ({_texto_dias_restantes(nuevo.fecha_entrega)}), "
                f"{_texto_urgencia(urgencia_combinada)}."
            ),
            entregable_id=nuevo.id,
            urgente=urgencia_combinada,
            push=False,
        )
        enviar_push(
            db,
            responsable_id,
            "Tarea urgente asignada" if urgencia_combinada else "Nueva tarea asignada",
            f'{usuario.nombre} te asignó "{nuevo.nombre}" ({_texto_dias_restantes(nuevo.fecha_entrega)}).',
        )
        # WhatsApp SIEMPRE al asignar (2026-09-02, a petición de Yue --
        # antes solo se mandaba si era urgente; ahora es un aviso normal de
        # cualquier asignación desde la app, mismo criterio que ya usa
        # asignar por WhatsApp -- ver app/routers/whatsapp_webhook.py).
        enviar_whatsapp(db, responsable_id, mensaje_whatsapp_asignacion(usuario.nombre, nuevo))
        responsable = db.query(Usuario).filter(Usuario.id == responsable_id).first()
        if responsable:
            avisar_si_nunca_ha_entrado(db, responsable, usuario, nuevo.nombre)
            _notificar_supervisor_de_asignacion(db, usuario, responsable, nuevo)
    elif not es_lider and rol.supervisor_id:
        crear_notificacion(
            db,
            rol.supervisor_id,
            TipoNotificacion.entregable_asignado,
            (
                f'{usuario.nombre} se autoasignó "{nuevo.nombre}" (fecha límite: '
                f"{nuevo.fecha_entrega}, {_texto_dias_restantes(nuevo.fecha_entrega)})."
            ),
            entregable_id=nuevo.id,
        )

    return nuevo


def obtener_entregable_o_404(db: Session, entregable_id: int) -> Entregable:
    entregable = db.query(Entregable).filter(Entregable.id == entregable_id).first()
    if not entregable:
        raise HTTPException(status_code=404, detail="Entregable no encontrado")
    return entregable


def actualizar_entregable(
    db: Session, usuario: Usuario, entregable_id: int, campos: dict
) -> Entregable:
    """Edición general del entregable (nombre, fecha, responsable, etc).
    Requiere ser quien lo creó, o super_admin (2026-08-22, ver
    puede_editar_entregable)."""
    entregable = obtener_entregable_o_404(db, entregable_id)

    if not puede_editar_entregable(db, usuario, entregable):
        raise HTTPException(
            status_code=403, detail="Solo quien creó este entregable puede editarlo"
        )

    verificar_contenido(
        db, usuario, "entregable", nombre=campos.get("nombre"), descripcion=campos.get("descripcion")
    )

    for campo, valor in campos.items():
        setattr(entregable, campo, valor)

    return entregable


def mover_entregable(db: Session, usuario: Usuario, entregable_id: int, direccion: str) -> None:
    """Intercambia el `orden` de este entregable con su vecino más cercano
    DENTRO DEL MISMO proyecto/tema (2026-08-19, a petición de Yue: "que
    quede igual que temas/subtemas") -- mismo patrón que mover_proyecto
    (app/services/proyectos.py). Requiere N1/N2, igual que
    actualizar_entregable/eliminar_entregable."""
    entregable = obtener_entregable_o_404(db, entregable_id)

    rol = requerir_participacion_en_proyecto(db, usuario, entregable.proyecto_id)
    requerir_rol_minimo(rol, [RolEnum.N1, RolEnum.N2])

    if direccion not in ("arriba", "abajo"):
        raise HTTPException(status_code=400, detail="direccion debe ser 'arriba' o 'abajo'")

    hermanos = (
        db.query(Entregable)
        .filter(Entregable.proyecto_id == entregable.proyecto_id)
        .order_by(Entregable.orden, Entregable.id)
        .all()
    )
    posicion = next((i for i, h in enumerate(hermanos) if h.id == entregable.id), None)
    if posicion is None:
        return
    vecino_pos = posicion - 1 if direccion == "arriba" else posicion + 1
    if vecino_pos < 0 or vecino_pos >= len(hermanos):
        return
    vecino = hermanos[vecino_pos]
    entregable.orden, vecino.orden = vecino.orden, entregable.orden


def eliminar_entregable(db: Session, usuario: Usuario, entregable_id: int) -> None:
    """
    Elimina un entregable. Requiere ser quien lo creó, o super_admin
    (2026-08-22, mismo gate que actualizar_entregable, ver
    puede_editar_entregable) -- no el propio responsable, para no perder
    trazabilidad de alguien borrando su propio pendiente.

    Historial de avance y notas cascadean solos (relaciones ORM en
    Entregable). Notificacion.entregable_id y AcuerdoMinuta.entregable_id son
    nullable y no cascadean por ORM — se limpian a mano: las notificaciones
    se borran (ya no tiene sentido notificar sobre algo que ya no existe),
    pero un acuerdo de minuta ya convertido en este entregable NO se borra,
    solo se desvincula (entregable_id = NULL) — el acuerdo en sí sigue siendo
    un registro válido de lo que se discutió en la reunión.
    """
    entregable = obtener_entregable_o_404(db, entregable_id)

    if not puede_editar_entregable(db, usuario, entregable):
        raise HTTPException(
            status_code=403, detail="Solo quien creó este entregable puede eliminarlo"
        )

    db.query(Notificacion).filter(Notificacion.entregable_id == entregable_id).delete(
        synchronize_session=False
    )
    db.query(AcuerdoMinuta).filter(AcuerdoMinuta.entregable_id == entregable_id).update(
        {AcuerdoMinuta.entregable_id: None}, synchronize_session=False
    )

    db.delete(entregable)


def actualizar_avance(
    db: Session, usuario: Usuario, entregable_id: int, porcentaje_avance: int
) -> Entregable:
    """
    Actualiza el % de avance de un entregable y guarda el registro en el
    historial (para poder comparar "antes vs. ahora"). El propio responsable
    puede hacerlo, además de N1/N2 del proyecto. Notifica al supervisor del
    responsable en cada actualización, y a quien creó el entregable si se
    completó (y es alguien distinto del supervisor ya notificado).
    """
    entregable = obtener_entregable_o_404(db, entregable_id)

    if not puede_actualizar_avance_entregable(db, usuario, entregable):
        raise HTTPException(
            status_code=403, detail="No tienes permiso para actualizar este entregable"
        )

    if (
        porcentaje_avance >= 100
        and entregable.requiere_comprobante
        and not entregable.comprobante_path
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Este entregable requiere un comprobante antes de poder marcarse "
                "como completado. Sube la imagen desde el detalle de la tarea."
            ),
        )

    # "Visto bueno" (2026-09-03, aprobado por Yue el 2026-08-26): llegar a
    # 100% ya NO completa directo -- pasa a pendiente_aprobacion hasta que
    # quien creó la tarea (o un N1/N2 del tema) lo apruebe, SALVO
    # autoasignación (creado_por == responsable_id: no tiene sentido pedir
    # que alguien más apruebe que te autoasignaste algo y lo terminaste).
    # avance_previo_aprobacion guarda el % ANTERIOR (antes de sobreescribirlo
    # abajo) para poder regresar a él si se rechaza, en vez de a 0.
    avance_anterior = entregable.porcentaje_avance
    autoasignacion = entregable.creado_por == entregable.responsable_id
    entra_a_aprobacion = porcentaje_avance >= 100 and not autoasignacion

    entregable.porcentaje_avance = porcentaje_avance
    if entra_a_aprobacion:
        entregable.estatus = EstatusEntregable.pendiente_aprobacion
        entregable.avance_previo_aprobacion = avance_anterior
    elif porcentaje_avance >= 100:
        entregable.estatus = EstatusEntregable.cumplido
    elif porcentaje_avance > 0:
        entregable.estatus = EstatusEntregable.en_progreso
    else:
        entregable.estatus = EstatusEntregable.pendiente

    db.add(
        HistorialAvance(
            entregable_id=entregable.id,
            porcentaje_avance=porcentaje_avance,
            actualizado_por=usuario.id,
        )
    )

    rol_responsable = obtener_rol_en_proyecto(db, entregable.responsable_id, entregable.proyecto_id)
    supervisor_id = rol_responsable.supervisor_id if rol_responsable else None

    notificados = set()
    if supervisor_id and supervisor_id != usuario.id:
        if entra_a_aprobacion:
            mensaje = (
                f'{usuario.nombre} marcó "{entregable.nombre}" al 100% -- '
                f"está en espera de visto bueno."
            )
        elif entregable.estatus == EstatusEntregable.cumplido:
            mensaje = f'{usuario.nombre} marcó como completada la tarea "{entregable.nombre}".'
        else:
            mensaje = (
                f'{usuario.nombre} actualizó el avance de "{entregable.nombre}" '
                f"a {porcentaje_avance}%."
            )
        crear_notificacion(
            db,
            supervisor_id,
            TipoNotificacion.avance_actualizado,
            mensaje,
            entregable_id=entregable.id,
        )
        notificados.add(supervisor_id)

    if entra_a_aprobacion and entregable.creado_por not in notificados:
        crear_notificacion(
            db,
            entregable.creado_por,
            TipoNotificacion.otro,
            f'{usuario.nombre} marcó "{entregable.nombre}" al 100% -- necesita tu visto bueno.',
            entregable_id=entregable.id,
        )
    elif (
        entregable.estatus == EstatusEntregable.cumplido
        and entregable.creado_por != usuario.id
        and entregable.creado_por not in notificados
    ):
        crear_notificacion(
            db,
            entregable.creado_por,
            TipoNotificacion.otro,
            f'{usuario.nombre} marcó como completada la tarea "{entregable.nombre}".',
            entregable_id=entregable.id,
        )

    return entregable


def aprobar_entregable(db: Session, usuario: Usuario, entregable_id: int) -> Entregable:
    """"Visto bueno": confirma que el trabajo marcado al 100% de verdad se
    completó -- pasa de pendiente_aprobacion a cumplido. Solo quien creó
    la tarea o un N1/N2 del tema (ver puede_aprobar_rechazar_entregable)."""
    entregable = obtener_entregable_o_404(db, entregable_id)

    if not puede_aprobar_rechazar_entregable(db, usuario, entregable):
        raise HTTPException(status_code=403, detail="No tienes permiso para aprobar esta tarea")
    if entregable.estatus != EstatusEntregable.pendiente_aprobacion:
        raise HTTPException(status_code=400, detail="Esta tarea no está en espera de visto bueno")

    entregable.estatus = EstatusEntregable.cumplido
    entregable.avance_previo_aprobacion = None

    if entregable.responsable_id != usuario.id:
        crear_notificacion(
            db,
            entregable.responsable_id,
            TipoNotificacion.otro,
            f'{usuario.nombre} le dio visto bueno a "{entregable.nombre}". ¡Quedó completada!',
            entregable_id=entregable.id,
        )

    return entregable


def rechazar_entregable(db: Session, usuario: Usuario, entregable_id: int, nota: str) -> Entregable:
    """"Visto bueno": rechaza el 100% marcado -- regresa al % que tenía
    ANTES de llegar a 100 (no a 0, ver avance_previo_aprobacion) y deja
    registrado el motivo como nota, visible en el hilo del entregable. La
    nota es obligatoria -- el responsable necesita saber qué corregir."""
    nota = (nota or "").strip()
    if not nota:
        raise HTTPException(status_code=400, detail="Escribe el motivo del rechazo")

    entregable = obtener_entregable_o_404(db, entregable_id)

    if not puede_aprobar_rechazar_entregable(db, usuario, entregable):
        raise HTTPException(status_code=403, detail="No tienes permiso para rechazar esta tarea")
    if entregable.estatus != EstatusEntregable.pendiente_aprobacion:
        raise HTTPException(status_code=400, detail="Esta tarea no está en espera de visto bueno")

    avance_recuperado = entregable.avance_previo_aprobacion or 0
    entregable.porcentaje_avance = avance_recuperado
    entregable.estatus = (
        EstatusEntregable.en_progreso if avance_recuperado > 0 else EstatusEntregable.pendiente
    )
    entregable.avance_previo_aprobacion = None

    db.add(
        HistorialAvance(
            entregable_id=entregable.id,
            porcentaje_avance=avance_recuperado,
            actualizado_por=usuario.id,
        )
    )

    # La nota se crea ANTES de comitear el cambio de avance -- mismo
    # criterio de orden que reasignar_entregable (ver comentario ahí):
    # crear_nota valida que `usuario` pueda VER el entregable en su estado
    # actual, y aquí ese estado no cambia con esta acción, así que el
    # orden no es crítico, pero se mantiene por consistencia.
    from app.services.notas import crear_nota

    crear_nota(
        db, usuario,
        NotaCrear(entregable_id=entregable.id, contenido=f"Rechazado: {nota}"),
    )

    if entregable.responsable_id != usuario.id:
        crear_notificacion(
            db,
            entregable.responsable_id,
            TipoNotificacion.otro,
            f'{usuario.nombre} rechazó "{entregable.nombre}": {nota}',
            entregable_id=entregable.id,
        )

    return entregable


def reasignar_entregable(
    db: Session, usuario: Usuario, entregable_id: int, nuevo_responsable_id: int, nota: str | None = None
) -> Entregable:
    """Cambia el responsable de un entregable (2026-08-20, a petición del
    cliente: "si alguien te asignó algo que no te pertenece, poder
    reasignarlo") -- puede hacerlo N1/N2 del proyecto, O el propio
    responsable ACTUAL (a diferencia de actualizar_entregable, que solo
    deja tocar responsable_id a N1/N2; ver
    permissions.puede_reasignar_entregable). Notifica tanto al nuevo
    responsable como al anterior (si no fue él quien reasignó).

    `nuevo_responsable_id` puede ser alguien que NO participa todavía en
    este tema, siempre que sea líder (N1/N2) de ALGÚN otro tema (2026-08-20,
    a petición de Yue: "reasignarlo a otro líder de otra área" -- caso real
    Bernardo→David→otro N2, o David regresándoselo a Bernardo). En ese caso
    se le agrega como colaborador N2 de ESTE tema en el mismo paso, SIN
    mover la tarea de proyecto -- confirmado con Yue explícitamente. El alta
    se hace con un INSERT directo (no vía asignar_rol_en_proyecto, que exige
    que QUIEN LLAMA sea N1/N2 del proyecto destino -- eso bloquearía
    justo el caso real, ya que el responsable actual puede no serlo). La
    autorización de esta acción específica ya la dio puede_reasignar_entregable
    arriba; no hace falta re-validar con las reglas de "administrar equipo"
    de asignar_rol_en_proyecto, pensadas para un contexto distinto.

    `nota` (opcional): comentario visible en el hilo de notas del
    entregable, para el caso "esto no me compete" al reasignar de vuelta --
    reusa crear_nota (app/services/notas.py), sin tabla nueva."""
    entregable = obtener_entregable_o_404(db, entregable_id)

    if not puede_reasignar_entregable(db, usuario, entregable):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para reasignar este entregable",
        )

    # OJO: LOCAL (no obtener_rol_en_proyecto, que hereda de ancestros) --
    # usar la versión con herencia aquí es el mismo bug ya documentado en
    # obtener_rol_local_en_proyecto: alguien con acceso heredado (ej. un N1
    # de la raíz) "tiene rol" en este nodo sin tener una fila LOCAL, así que
    # igual haría falta darlo de alta aquí para que pueda seguir viendo
    # este entregable en concreto (query_entregables_visibles, para un N2
    # LOCAL, filtra por equipo/self usando la fila de ESTE nodo exacto).
    rol_local_nuevo = obtener_rol_local_en_proyecto(db, nuevo_responsable_id, entregable.proyecto_id)
    if rol_local_nuevo is None:
        if not es_lider_en_algun_tema(db, nuevo_responsable_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="La persona elegida no participa en este proyecto",
            )
        # supervisor_id = quien reasigna (2026-08-20, bug real encontrado en
        # pruebas): listar_equipo_visible/query_entregables_visibles, para
        # un N2 LOCAL, filtran su "equipo" por supervisor_id == usuario.id
        # -- con supervisor_id=None, Diana quedaba agregada pero invisible
        # tanto en GET /proyectos/{id}/usuarios como en el propio entregable
        # que se acababa de reasignar (ni siquiera quien reasignó, David,
        # podía verlo después, porque el responsable nuevo no estaba en SU
        # equipo). Poner a quien reasigna como supervisor replica
        # exactamente lo que ya hace asignar_rol_en_proyecto cuando N1/N2
        # agrega a alguien sin especificar supervisor.
        db.add(
            UsuarioProyectoRol(
                usuario_id=nuevo_responsable_id,
                proyecto_id=entregable.proyecto_id,
                rol=RolEnum.N2,
                supervisor_id=usuario.id,
            )
        )

    responsable_anterior_id = entregable.responsable_id

    # La nota se crea ANTES de cambiar responsable_id (2026-08-20, bug real
    # encontrado en pruebas): crear_nota valida que `usuario` pueda VER el
    # entregable (puede_ver_entregable -> query_entregables_visibles), que
    # para un N2 LOCAL depende de que responsable_id esté en su equipo o
    # sea él mismo -- si ya hubiéramos reasignado a alguien fuera de su
    # equipo, quien reasignó dejaría de "ver" su propio entregable a mitad
    # de esta misma función y crear_nota fallaría con 403 aunque
    # puede_reasignar_entregable ya haya autorizado la acción completa.
    if nota:
        from app.services.notas import crear_nota

        crear_nota(db, usuario, NotaCrear(entregable_id=entregable.id, contenido=nota))

    entregable.responsable_id = nuevo_responsable_id
    # Historial de responsable (2026-08-23, ver query_entregables_visibles):
    # una fila nueva por cada reasignación -- así quien fue responsable
    # antes (o quien reasignó estando de por medio) sigue viendo la tarea
    # aunque ya no sea el responsable actual ni supervisor directo del
    # nuevo. No se borra ni modifica la fila anterior -- es historial, no
    # estado actual.
    db.add(HistorialResponsable(entregable_id=entregable.id, usuario_id=nuevo_responsable_id))

    if nuevo_responsable_id != usuario.id:
        urgencia_combinada = es_urgente(entregable)
        # push=False: título/cuerpo específicos abajo, igual que en crear_entregable.
        crear_notificacion(
            db,
            nuevo_responsable_id,
            TipoNotificacion.entregable_asignado,
            (
                f'Se te asignó "{entregable.nombre}", por {usuario.nombre}, con fecha de '
                f"entrega {entregable.fecha_entrega} "
                f"({_texto_dias_restantes(entregable.fecha_entrega)}), "
                f"{_texto_urgencia(urgencia_combinada)}."
            ),
            entregable_id=entregable.id,
            urgente=urgencia_combinada,
            push=False,
        )
        enviar_push(
            db,
            nuevo_responsable_id,
            "Tarea urgente asignada" if urgencia_combinada else "Nueva tarea asignada",
            f'{usuario.nombre} te asignó "{entregable.nombre}" '
            f"({_texto_dias_restantes(entregable.fecha_entrega)}).",
        )
        # WhatsApp SIEMPRE al (re)asignar (2026-09-02, a petición de Yue --
        # mismo cambio que en crear_entregable, ver comentario ahí).
        enviar_whatsapp(db, nuevo_responsable_id, mensaje_whatsapp_asignacion(usuario.nombre, entregable))
        nuevo_responsable = db.query(Usuario).filter(Usuario.id == nuevo_responsable_id).first()
        if nuevo_responsable:
            avisar_si_nunca_ha_entrado(db, nuevo_responsable, usuario, entregable.nombre)
            _notificar_supervisor_de_asignacion(db, usuario, nuevo_responsable, entregable)
    if responsable_anterior_id != usuario.id and responsable_anterior_id != nuevo_responsable_id:
        crear_notificacion(
            db,
            responsable_anterior_id,
            TipoNotificacion.otro,
            f'{usuario.nombre} reasignó "{entregable.nombre}" a otra persona.',
            entregable_id=entregable.id,
        )

    return entregable


async def agregar_comprobante(
    db: Session, usuario: Usuario, entregable_id: int, archivo: UploadFile
) -> Entregable:
    """Adjunta (o reemplaza) la imagen de comprobante de un entregable
    (2026-08-21, a petición de Yue) -- mismo patrón que
    app/services/notas.py::agregar_imagen_a_nota. El comprobante es parte
    del flujo de "marcar concluido" (2026-08-22, ver
    puede_actualizar_avance_entregable), no de editar el entregable -- el
    propio responsable debe poder subirlo aunque ya no pueda editar los
    demás campos."""
    entregable = obtener_entregable_o_404(db, entregable_id)
    if not puede_actualizar_avance_entregable(db, usuario, entregable):
        raise HTTPException(
            status_code=403, detail="No tienes permiso para editar este entregable"
        )

    if entregable.comprobante_path:
        eliminar_imagen(entregable.comprobante_path)
    entregable.comprobante_path = await guardar_imagen(archivo, subcarpeta="comprobantes")
    return entregable

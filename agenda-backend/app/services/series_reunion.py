"""
Servicio de series de reuniones recurrentes + agenda persistente. Usado
por el router REST (app/routers/series_reunion.py) y, más adelante, por el
asistente de voz — mismo patrón que reuniones.py/minutas.py: nunca
reinventa una regla de permisos, siempre reutiliza app.core.permissions.

Una SerieReunion nunca aparece en el calendario directamente -- sus
ocurrencias se materializan como Reunion reales con serie_id puesto (ver
app/services/materializar_series.py), corridas por el mismo scheduler que
ya genera recordatorios (app/main.py).
"""
from datetime import date, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.permissions import (
    obtener_rol_en_proyecto,
    puede_editar_reunion,
    puede_ver_reunion,
    query_reuniones_generales_visibles,
    query_reuniones_visibles,
    requerir_participacion_en_proyecto,
    temas_relevantes_para_participantes,
)
from app.models.agenda_item import AgendaItem, AgendaItemRevision, EstadoRevision, TipoAgendaItem
from app.models.entregable import Entregable, EstatusEntregable
from app.models.nota import Nota
from app.models.notificacion import Notificacion
from app.models.pendiente import Pendiente
from app.models.reunion import Reunion, ReunionParticipante
from app.models.serie_reunion import SerieReunion, SerieReunionParticipante, TipoRecurrencia
from app.models.usuario import RolEnum, Usuario
from app.schemas.nota import NotaCrear
from app.schemas.pendiente import PendienteCrear
from app.schemas.serie_reunion import (
    AgendaItemOut,
    ParticipanteSerieOut,
    SerieReunionOut,
)
from app.services.notas import crear_nota
from app.services.pendientes import crear_pendiente
from app.services.proyectos import listar_arbol_visible
from app.services.reuniones import obtener_reunion_o_404


def puede_editar_serie(db: Session, usuario: Usuario, serie: SerieReunion) -> bool:
    """Mismo criterio que puede_editar_reunion: N1/N2 (local o heredado)
    del tema, o el organizador. Una serie general (proyecto_id None) la
    edita su organizador o CUALQUIER invitado -- ensanchado 2026-08-18
    (mismo criterio y misma fecha que puede_editar_reunion, ver el
    ensanche de esa función) para que marcar/desmarcar temas de una junta
    recurrente general no quede bloqueado solo al organizador (403
    reportado por Yue: David, invitado pero no organizador de una junta
    recurrente general, no podía guardar los temas de esa junta)."""
    if usuario.es_super_admin:
        return True
    if serie.proyecto_id is None:
        return serie.organizador_id == usuario.id or any(
            p.usuario_id == usuario.id for p in serie.participantes
        )
    rol = obtener_rol_en_proyecto(db, usuario.id, serie.proyecto_id)
    if rol is None:
        return False
    if rol.rol in (RolEnum.N1, RolEnum.N2):
        return True
    return serie.organizador_id == usuario.id


def serie_a_out(db: Session, usuario: Usuario, serie: SerieReunion) -> SerieReunionOut:
    return SerieReunionOut(
        id=serie.id,
        proyecto_id=serie.proyecto_id,
        proyecto_nombre=serie.proyecto.nombre if serie.proyecto else None,
        titulo=serie.titulo,
        notas=serie.notas,
        organizador_id=serie.organizador_id,
        organizador_nombre=serie.organizador.nombre,
        tipo_recurrencia=serie.tipo_recurrencia,
        dia_semana=serie.dia_semana,
        dia_mes=serie.dia_mes,
        hora=serie.hora,
        duracion_minutos=serie.duracion_minutos,
        recordatorio_minutos_antes=serie.recordatorio_minutos_antes,
        fecha_inicio=serie.fecha_inicio,
        fecha_fin=serie.fecha_fin,
        activa=serie.activa,
        participantes=[
            ParticipanteSerieOut(usuario_id=p.usuario_id, nombre=p.usuario.nombre)
            for p in serie.participantes
        ],
        puede_editar=puede_editar_serie(db, usuario, serie),
    )


def obtener_serie_o_404(db: Session, serie_id: int) -> SerieReunion:
    serie = db.query(SerieReunion).filter(SerieReunion.id == serie_id).first()
    if not serie:
        raise HTTPException(status_code=404, detail="Serie de reuniones no encontrada")
    return serie


def _verificar_puede_editar_item(db: Session, usuario: Usuario, item: AgendaItem) -> None:
    """Un AgendaItem cuelga de una serie O de una reunión suelta (nunca
    ambas, ver CheckConstraint en el modelo) -- resuelve cuál es su padre y
    aplica el mismo criterio de permiso que ya existía por separado en
    editar/mover/archivar_item_agenda."""
    if item.serie_id is not None:
        serie = obtener_serie_o_404(db, item.serie_id)
        if not puede_editar_serie(db, usuario, serie):
            raise HTTPException(
                status_code=403, detail="No tienes permiso para editar la agenda de esta serie"
            )
    else:
        reunion = obtener_reunion_o_404(db, item.reunion_id)
        if not puede_editar_reunion(db, usuario, reunion):
            raise HTTPException(
                status_code=403, detail="No tienes permiso para editar la agenda de esta reunión"
            )


def crear_serie(
    db: Session,
    usuario: Usuario,
    proyecto_id: int | None,
    titulo: str,
    hora,
    duracion_minutos: int,
    participantes_ids: list[int],
    fecha_inicio: date,
    fecha_fin: date | None,
    tipo_recurrencia: TipoRecurrencia = TipoRecurrencia.semanal,
    dia_semana: int | None = None,
    dia_mes: int | None = None,
    notas: str | None = None,
    recordatorio_minutos_antes: int | None = None,
) -> SerieReunion:
    """Cualquier participante del tema puede proponer una serie -- mismo
    criterio que crear_reunion, no requiere N1/N2. `dia_semana` obligatorio
    para tipo_recurrencia=semanal, `dia_mes` obligatorio para =mensual --
    validado aquí en vez de solo en el schema porque la combinación válida
    depende de tipo_recurrencia."""
    if proyecto_id is not None:
        requerir_participacion_en_proyecto(db, usuario, proyecto_id)

    if tipo_recurrencia == TipoRecurrencia.semanal and dia_semana is None:
        raise HTTPException(status_code=400, detail="Falta dia_semana para una serie semanal")
    if tipo_recurrencia == TipoRecurrencia.mensual and not (dia_mes and 1 <= dia_mes <= 31):
        raise HTTPException(status_code=400, detail="Falta dia_mes (1-31) para una serie mensual")

    nueva = SerieReunion(
        proyecto_id=proyecto_id,
        titulo=titulo,
        notas=notas,
        organizador_id=usuario.id,
        tipo_recurrencia=tipo_recurrencia,
        dia_semana=dia_semana if tipo_recurrencia == TipoRecurrencia.semanal else None,
        dia_mes=dia_mes if tipo_recurrencia == TipoRecurrencia.mensual else None,
        hora=hora,
        duracion_minutos=duracion_minutos,
        recordatorio_minutos_antes=recordatorio_minutos_antes,
        fecha_inicio=fecha_inicio,
        fecha_fin=fecha_fin,
    )
    db.add(nueva)
    db.flush()

    for uid in set(participantes_ids) - {usuario.id}:
        db.add(SerieReunionParticipante(serie_id=nueva.id, usuario_id=uid))

    return nueva


def actualizar_serie(db: Session, usuario: Usuario, serie_id: int, campos: dict) -> SerieReunion:
    serie = obtener_serie_o_404(db, serie_id)
    if not puede_editar_serie(db, usuario, serie):
        raise HTTPException(status_code=403, detail="No tienes permiso para editar esta serie")

    participantes_ids = campos.pop("participantes_ids", None)
    campos_aplicados = {campo: valor for campo, valor in campos.items() if valor is not None}
    for campo, valor in campos_aplicados.items():
        setattr(serie, campo, valor)

    if participantes_ids is not None:
        db.query(SerieReunionParticipante).filter(
            SerieReunionParticipante.serie_id == serie.id
        ).delete()
        for uid in set(participantes_ids) - {serie.organizador_id}:
            db.add(SerieReunionParticipante(serie_id=serie.id, usuario_id=uid))

    # Sincronizar las ocurrencias YA MATERIALIZADAS que todavía no pasan
    # (2026-08-18, a petición de Yue: corregir el nombre/hora de una serie
    # debe corregir también lo que ya se había generado con antelación, no
    # solo lo que se genere de aquí en adelante -- materializar_ocurrencias
    # nunca vuelve a tocar una ocurrencia ya creada, ver
    # app/services/materializar_series.py). Acotado a título/hora-del-día/
    # duración/participantes -- NO a dia_semana/dia_mes/fecha_inicio,
    # porque cambiar el día del patrón implicaría recalcular la FECHA de
    # cada ocurrencia futura (qué día cae, no solo a qué hora), mucho más
    # invasivo y fuera de lo pedido. Las ocurrencias que YA PASARON no se
    # tocan -- son historial, no plantilla.
    if (
        {"titulo", "hora", "duracion_minutos", "notas", "recordatorio_minutos_antes"}
        & campos_aplicados.keys()
        or participantes_ids is not None
    ):
        ocurrencias_futuras = (
            db.query(Reunion)
            .filter(Reunion.serie_id == serie.id, Reunion.fecha_inicio > datetime.utcnow())
            .all()
        )
        for ocurrencia in ocurrencias_futuras:
            if "titulo" in campos_aplicados:
                ocurrencia.titulo = serie.titulo
            if "hora" in campos_aplicados:
                ocurrencia.fecha_inicio = datetime.combine(ocurrencia.fecha_inicio.date(), serie.hora)
            if "duracion_minutos" in campos_aplicados:
                ocurrencia.duracion_minutos = serie.duracion_minutos
            if "notas" in campos_aplicados:
                ocurrencia.notas = serie.notas
            if "recordatorio_minutos_antes" in campos_aplicados:
                ocurrencia.recordatorio_minutos_antes = serie.recordatorio_minutos_antes
            if participantes_ids is not None:
                db.query(ReunionParticipante).filter(
                    ReunionParticipante.reunion_id == ocurrencia.id
                ).delete()
                for uid in set(participantes_ids) - {ocurrencia.organizador_id}:
                    db.add(ReunionParticipante(reunion_id=ocurrencia.id, usuario_id=uid))

    return serie


def eliminar_serie(
    db: Session, usuario: Usuario, serie_id: int, eliminar_ocurrencias: bool = False
) -> None:
    """Elimina la serie y su agenda persistente (cascade). Por default las
    ocurrencias YA materializadas (Reunion.serie_id) NO se borran -- quedan
    como reuniones sueltas normales, con su historial intacto; solo se les
    limpia la referencia a la serie eliminada.

    `eliminar_ocurrencias=True` (2026-08-18, a petición de Yue: "si quiero
    eliminarla, dame la opción de eliminar todas las reuniones que salieron
    de esa reunión recurrente, así no tengo que eliminar una por una")
    borra también cada ocurrencia ya agendada -- mismo criterio de limpieza
    que `reuniones.eliminar_reunion` (Notificacion no cascada por relación
    ORM, se limpia a mano; minuta/notas/agenda-items sí cascadan solos, ver
    esa función). No se reutiliza `eliminar_reunion` directo para no
    repetir el chequeo de permiso por cada ocurrencia -- ya se validó una
    vez sobre la serie completa."""
    serie = obtener_serie_o_404(db, serie_id)
    if not puede_editar_serie(db, usuario, serie):
        raise HTTPException(status_code=403, detail="No tienes permiso para eliminar esta serie")

    ocurrencias = db.query(Reunion).filter(Reunion.serie_id == serie.id).all()
    if eliminar_ocurrencias:
        for r in ocurrencias:
            db.query(Notificacion).filter(Notificacion.reunion_id == r.id).delete(
                synchronize_session=False
            )
            db.delete(r)
    else:
        db.query(Reunion).filter(Reunion.serie_id == serie.id).update({Reunion.serie_id: None})
    db.delete(serie)


def listar_series_visibles(db: Session, usuario: Usuario, proyecto_id: int | None) -> list[SerieReunion]:
    """Mismo criterio de visibilidad que las reuniones puntuales de ese
    tema (o generales si proyecto_id es None) -- reutiliza
    query_reuniones_visibles/query_reuniones_generales_visibles filtrando
    por serie_id no nulo, para no duplicar la regla de "quién ve qué"."""
    if proyecto_id is None:
        ids_serie = {
            r.serie_id
            for r in query_reuniones_generales_visibles(db, usuario).all()
            if r.serie_id is not None
        }
    else:
        ids_serie = {
            r.serie_id
            for r in query_reuniones_visibles(db, usuario, proyecto_id).all()
            if r.serie_id is not None
        }
    if not ids_serie:
        # Una serie recién creada puede no tener ninguna ocurrencia
        # materializada todavía -- no debe desaparecer de la lista solo
        # por eso. Se cae al listado directo (organizador/N1) para no
        # perder series nuevas.
        query = db.query(SerieReunion).filter(SerieReunion.proyecto_id == proyecto_id)
        if proyecto_id is not None:
            rol = requerir_participacion_en_proyecto(db, usuario, proyecto_id)
            if rol.rol != RolEnum.N1:
                query = query.filter(SerieReunion.organizador_id == usuario.id)
        else:
            query = query.filter(SerieReunion.organizador_id == usuario.id)
        return query.all()
    return db.query(SerieReunion).filter(SerieReunion.id.in_(ids_serie)).all()


# --- Agenda persistente ------------------------------------------------


def _nombre_agenda_item(item: AgendaItem) -> str:
    if item.tipo == TipoAgendaItem.tema:
        return item.proyecto.nombre if item.proyecto else "(tema eliminado)"
    if item.tipo == TipoAgendaItem.entregable:
        return item.entregable.nombre if item.entregable else "(entregable eliminado)"
    if item.tipo == TipoAgendaItem.acuerdo:
        return item.acuerdo.descripcion if item.acuerdo else "(acuerdo eliminado)"
    if item.tipo == TipoAgendaItem.nota:
        if not item.nota:
            return "(nota eliminada)"
        contenido = item.nota.contenido
        return contenido if len(contenido) <= 80 else contenido[:77] + "..."
    if item.tipo == TipoAgendaItem.pendiente and item.pendiente_id is not None:
        # Ítems creados antes de que pendiente_id existiera no tienen esta
        # referencia -- siguen leyendo item.texto (rama de abajo).
        return item.pendiente.contenido if item.pendiente else "(pendiente eliminado)"
    return item.texto or ""


def item_a_out(item: AgendaItem) -> AgendaItemOut:
    ultima = (
        sorted(item.revisiones, key=lambda r: r.fecha_registro, reverse=True)[0]
        if item.revisiones
        else None
    )
    return AgendaItemOut(
        id=item.id,
        serie_id=item.serie_id,
        reunion_id=item.reunion_id,
        tipo=item.tipo,
        nombre=_nombre_agenda_item(item),
        detalle=item.detalle,
        seccion_proyecto_id=item.seccion_proyecto_id,
        seccion_nombre=item.seccion.nombre if item.seccion else None,
        seccion_parent_id=item.seccion.parent_id if item.seccion else None,
        activo=item.activo,
        orden=item.orden,
        estado_actual=ultima.estado if ultima else EstadoRevision.pendiente,
        ultima_nota=ultima.nota if ultima else None,
        ultima_fecha_revision=ultima.fecha_registro if ultima else None,
        ultima_reunion_id=ultima.reunion_id if ultima else None,
    )


def agenda_actual_de_serie(db: Session, usuario: Usuario, serie_id: int) -> list[AgendaItemOut]:
    serie = obtener_serie_o_404(db, serie_id)
    if serie.proyecto_id is not None:
        requerir_participacion_en_proyecto(db, usuario, serie.proyecto_id)
    items = (
        db.query(AgendaItem)
        .filter(AgendaItem.serie_id == serie_id, AgendaItem.activo.is_(True))
        .order_by(AgendaItem.orden, AgendaItem.id)
        .all()
    )
    return [item_a_out(i) for i in items]


def agenda_actual_de_reunion(db: Session, usuario: Usuario, reunion_id: int) -> list[AgendaItemOut]:
    """Hermana de agenda_actual_de_serie, para el checklist propio de una
    reunión suelta -- usa puede_ver_reunion (más estricto que el chequeo
    laxo que agenda_actual_de_serie ya tenía para series generales; no se
    toca esa, solo no se repite la misma laxitud aquí)."""
    reunion = obtener_reunion_o_404(db, reunion_id)
    if not puede_ver_reunion(db, usuario, reunion):
        raise HTTPException(status_code=403, detail="No tienes acceso a esta reunión")
    items = (
        db.query(AgendaItem)
        .filter(AgendaItem.reunion_id == reunion_id, AgendaItem.activo.is_(True))
        .order_by(AgendaItem.orden, AgendaItem.id)
        .all()
    )
    return [item_a_out(i) for i in items]


def arbol_temas_relevantes_de_junta(
    db: Session, usuario: Usuario, serie_id: int | None = None, reunion_id: int | None = None
) -> list[dict]:
    """Árbol de temas para el selector "Temas de esta junta" -- acotado a
    quién organiza + quién está invitado (ver
    permissions.temas_relevantes_para_participantes), no el árbol COMPLETO
    visible al usuario (que para alguien con Dirección global es
    prácticamente todo el árbol de la empresa). 2026-08-18, a petición de
    Yue: "si es entre Diana y Bernardo, solo deberían aparecer los temas
    que tienen Diana y Bernardo -- los de David o Jasso, si no tienen nada
    en común o ni siquiera están invitados, no necesitan aparecer".

    Si la junta todavía tiene menos de 2 participantes (recién creada, sin
    invitados aún), no hay ningún par jefe-reporte que resolver -- cae de
    vuelta al árbol completo visible al usuario, para no dejar el selector
    vacío antes de invitar a alguien. En cuanto se invite a alguien, se
    recarga (misma `key` de SelectorTemasChecklist ya fuerza esto).
    """
    if serie_id is not None:
        serie = obtener_serie_o_404(db, serie_id)
        participantes_ids = {serie.organizador_id, *(p.usuario_id for p in serie.participantes)}
    else:
        reunion = obtener_reunion_o_404(db, reunion_id)
        participantes_ids = {reunion.organizador_id, *(p.usuario_id for p in reunion.participantes)}

    arbol_completo = listar_arbol_visible(db, usuario)
    if len(participantes_ids) < 2:
        return arbol_completo

    relevantes = temas_relevantes_para_participantes(db, list(participantes_ids))
    return [nodo for nodo in arbol_completo if nodo["id"] in relevantes]


def agregar_item_agenda(
    db: Session,
    usuario: Usuario,
    serie_id: int | None,
    tipo: TipoAgendaItem,
    reunion_id: int | None = None,
    proyecto_id: int | None = None,
    entregable_id: int | None = None,
    acuerdo_id: int | None = None,
    nota_id: int | None = None,
    nota_contenido: str | None = None,
    pendiente_id: int | None = None,
    pendiente_contenido: str | None = None,
    texto: str | None = None,
    detalle: str | None = None,
    seccion_proyecto_id: int | None = None,
    creado_en_reunion_id: int | None = None,
) -> AgendaItem:
    # Exactamente uno de serie_id/reunion_id -- ver
    # ck_agenda_item_serie_o_reunion en app/models/agenda_item.py.
    if serie_id is not None:
        serie = obtener_serie_o_404(db, serie_id)
        if not puede_editar_serie(db, usuario, serie):
            raise HTTPException(
                status_code=403, detail="No tienes permiso para editar la agenda de esta serie"
            )
    elif reunion_id is not None:
        reunion = obtener_reunion_o_404(db, reunion_id)
        if not puede_editar_reunion(db, usuario, reunion):
            raise HTTPException(
                status_code=403, detail="No tienes permiso para editar la agenda de esta reunión"
            )
    else:
        raise HTTPException(status_code=400, detail="Debes indicar serie_id o reunion_id")

    # tipo=tema: si no se manda sección explícita, el ítem se agrupa bajo sí
    # mismo (el tema que representa) -- el frontend normalmente ya manda
    # seccion_proyecto_id == proyecto_id para este caso.
    if tipo == TipoAgendaItem.tema and seccion_proyecto_id is None:
        seccion_proyecto_id = proyecto_id
    elif tipo == TipoAgendaItem.nota and nota_id is None:
        if not nota_contenido:
            raise HTTPException(
                status_code=400,
                detail="Debes elegir una nota existente (nota_id) o escribir una nueva (nota_contenido)",
            )
        nueva_nota = crear_nota(
            db,
            usuario,
            NotaCrear(contenido=nota_contenido, proyecto_id=seccion_proyecto_id),
        )
        nota_id = nueva_nota.id
    elif tipo == TipoAgendaItem.pendiente and pendiente_id is None:
        if not pendiente_contenido:
            raise HTTPException(
                status_code=400,
                detail="Debes elegir un pendiente existente (pendiente_id) o escribir uno "
                "nuevo (pendiente_contenido)",
            )
        if seccion_proyecto_id is not None:
            # Con tema: se guarda como Pendiente reutilizable (requiere
            # proyecto_id, ver app/models/pendiente.py).
            nuevo_pendiente = crear_pendiente(
                db,
                usuario,
                PendienteCrear(contenido=pendiente_contenido, proyecto_id=seccion_proyecto_id),
            )
            pendiente_id = nuevo_pendiente.id
        else:
            # Sin tema (junta general sin sección): comportamiento previo a
            # que existiera Pendiente -- queda como texto libre suelto en
            # el propio AgendaItem, sin entidad reutilizable (Pendiente
            # exige un proyecto_id del que no hay aquí).
            texto = pendiente_contenido

    max_orden = (
        db.query(AgendaItem)
        .filter(AgendaItem.serie_id == serie_id, AgendaItem.reunion_id == reunion_id)
        .count()
    )
    item = AgendaItem(
        serie_id=serie_id,
        reunion_id=reunion_id,
        tipo=tipo,
        proyecto_id=proyecto_id,
        entregable_id=entregable_id,
        acuerdo_id=acuerdo_id,
        nota_id=nota_id,
        pendiente_id=pendiente_id,
        texto=texto,
        detalle=detalle,
        seccion_proyecto_id=seccion_proyecto_id,
        orden=max_orden,
        creado_en_reunion_id=creado_en_reunion_id,
    )
    db.add(item)
    db.flush()
    if tipo == TipoAgendaItem.tema and proyecto_id is not None:
        # Siembra el contenido de este tema al agregarlo suelto -- mismo
        # paso que ya hacía actualizar_temas al guardar el conjunto
        # completo (2026-08-18, selector "+ Agregar tema a esta agenda" en
        # SeccionAgendaChecklist.jsx: agrega UN tema a la vez, para cuando
        # un invitado nuevo destapa un tema en común que la siembra inicial
        # de la junta no incluyó). Idempotente, ver _sembrar_...
        _sembrar_entregables_notas_pendientes(db, usuario, serie_id, reunion_id, [proyecto_id])
    return item


def editar_item_agenda(db: Session, usuario: Usuario, item_id: int, campos: dict) -> AgendaItem:
    """Edita texto/detalle/sección de un ítem ya creado -- no cambia `tipo`
    ni las referencias fuertes (entregable_id/acuerdo_id/nota_id/proyecto_id
    de tipo=tema); para eso se archiva y se crea uno nuevo. `campos` ya
    viene filtrado por el router con `exclude_unset=True`, así que cada
    valor presente (incluido None, ej. limpiar seccion_proyecto_id para
    mandar el punto a "General") se aplica tal cual -- a diferencia de
    otros `actualizar_*` de este archivo, aquí NO se filtra `is not None`,
    porque eso bloquearía justo el caso de querer limpiar una sección."""
    item = db.query(AgendaItem).filter(AgendaItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Ítem de agenda no encontrado")
    _verificar_puede_editar_item(db, usuario, item)
    for campo, valor in campos.items():
        setattr(item, campo, valor)
    return item


def mover_item_agenda(db: Session, usuario: Usuario, item_id: int, direccion: str) -> None:
    """Intercambia el `orden` de este ítem con su vecino más cercano DENTRO
    DE LA MISMA SECCIÓN (seccion_proyecto_id igual, o ambos sin sección) --
    reordenar entre secciones distintas no tiene sentido visualmente, cada
    una se muestra agrupada aparte. Flechas arriba/abajo en vez de
    drag-and-drop, para no agregar una librería nueva."""
    item = db.query(AgendaItem).filter(AgendaItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Ítem de agenda no encontrado")
    _verificar_puede_editar_item(db, usuario, item)
    if direccion not in ("arriba", "abajo"):
        raise HTTPException(status_code=400, detail="direccion debe ser 'arriba' o 'abajo'")

    hermanos = (
        db.query(AgendaItem)
        .filter(
            AgendaItem.serie_id == item.serie_id,
            AgendaItem.reunion_id == item.reunion_id,
            AgendaItem.activo.is_(True),
            AgendaItem.seccion_proyecto_id == item.seccion_proyecto_id,
        )
        .order_by(AgendaItem.orden, AgendaItem.id)
        .all()
    )
    posicion = next((i for i, h in enumerate(hermanos) if h.id == item.id), None)
    if posicion is None:
        return
    vecino_pos = posicion - 1 if direccion == "arriba" else posicion + 1
    if vecino_pos < 0 or vecino_pos >= len(hermanos):
        return  # ya está en el extremo, no hay nada que mover
    vecino = hermanos[vecino_pos]
    item.orden, vecino.orden = vecino.orden, item.orden


def archivar_item_agenda(db: Session, usuario: Usuario, item_id: int) -> None:
    """No borra -- solo activo=False, para conservar su historial de
    revisiones (la bitácora de lo que se habló no debe desaparecer).

    Si es un ítem tipo=tema (el botón "Quitar" del encabezado de sección en
    SeccionAgendaChecklist -- 2026-08-18, reemplaza al checkbox que antes
    hacía esto mismo desde el árbol visible), también archiva lo que se
    había sembrado bajo su sección -- mismo bloque de limpieza que
    actualizar_temas al desmarcar un tema, para no reintroducir el bug de
    "fantasmas" (entregables/notas/pendientes que se quedaban activos para
    siempre tras quitar su tema)."""
    item = db.query(AgendaItem).filter(AgendaItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Ítem de agenda no encontrado")
    _verificar_puede_editar_item(db, usuario, item)
    item.activo = False
    if item.tipo == TipoAgendaItem.tema and item.proyecto_id is not None:
        filtro = (
            AgendaItem.serie_id == item.serie_id
            if item.serie_id is not None
            else AgendaItem.reunion_id == item.reunion_id
        )
        db.query(AgendaItem).filter(
            filtro,
            AgendaItem.seccion_proyecto_id == item.proyecto_id,
            AgendaItem.tipo.in_(
                [TipoAgendaItem.entregable, TipoAgendaItem.nota, TipoAgendaItem.pendiente]
            ),
            AgendaItem.activo.is_(True),
        ).update({AgendaItem.activo: False}, synchronize_session=False)


def actualizar_temas(
    db: Session,
    usuario: Usuario,
    serie_id: int | None,
    reunion_id: int | None,
    proyecto_ids: list[int],
) -> None:
    """Sincroniza los ítems tipo=tema de la agenda de una junta (serie
    recurrente o reunión suelta -- exactamente uno de los dos ids) con el
    conjunto elegido a mano en ModalReunion: los temas fuera de
    `proyecto_ids` se archivan (activo=False), los que faltan se
    agregan/reactivan. Generalizado 2026-08-18 desde el caso 1:1 original
    (antes solo aplicaba a checklists es_agenda_1a1) a CUALQUIER junta --
    "poner todos los temas y dejar elegir cuáles aplican a esta reunión".

    Mismo permiso que agregar cualquier otro ítem de agenda
    (puede_editar_serie / puede_editar_reunion, sin regla nueva) -- para
    una serie sigue siendo solo el organizador; para una reunión suelta
    general, cualquier invitado (ver el ensanche 2026-08-18 de
    puede_editar_reunion)."""
    if serie_id is not None:
        serie = obtener_serie_o_404(db, serie_id)
        if not puede_editar_serie(db, usuario, serie):
            raise HTTPException(
                status_code=403, detail="No tienes permiso para editar la agenda de esta serie"
            )
        filtro = AgendaItem.serie_id == serie_id
    else:
        reunion = obtener_reunion_o_404(db, reunion_id)
        if not puede_editar_reunion(db, usuario, reunion):
            raise HTTPException(
                status_code=403, detail="No tienes permiso para editar la agenda de esta reunión"
            )
        filtro = AgendaItem.reunion_id == reunion_id

    existentes = (
        db.query(AgendaItem).filter(filtro, AgendaItem.tipo == TipoAgendaItem.tema).all()
    )
    # Solo los ítems ACTIVOS cuentan como "ya marcado" -- uno archivado
    # (por desmarcarlo antes, o porque se marcó revisado, ver
    # app.services.minutas.registrar_revision_agenda_item) NUNCA se
    # reactiva solo porque el árbol de checkboxes lo vuelve a mandar
    # marcado; si el usuario de verdad quiere retomar ese tema, se crea un
    # ítem nuevo en vez de resucitar el archivado. Antes esta función
    # indexaba TODOS los ítems (activos o no) en un dict por proyecto_id y
    # forzaba `item.activo = pid in deseados` sobre ese único ítem
    # encontrado -- eso resucitaba en cada guardado cualquier tema que
    # `registrar_revision_agenda_item` acababa de archivar por "revisado",
    # ya que el árbol de checkboxes del frontend no se refresca solo (carga
    # su selección una vez al montar) y sigue mandando ese tema como
    # marcado en el siguiente guardado de conjunto completo. También
    # colapsaba de paso cualquier duplicado activo a uno solo (2026-08-18,
    # bug reportado por Yue: un tema marcado aparecía dos veces en la
    # agenda).
    activos_por_proyecto: dict[int | None, AgendaItem] = {}
    for i in existentes:
        if not i.activo:
            continue
        if i.proyecto_id in activos_por_proyecto:
            i.activo = False
            continue
        activos_por_proyecto[i.proyecto_id] = i
    deseados = set(proyecto_ids)

    for pid, item in activos_por_proyecto.items():
        if pid not in deseados:
            item.activo = False
            # Al desmarcar un tema, también se archivan los entregables/
            # notas/pendientes que se habían sembrado bajo su sección
            # (2026-08-18, bug reportado por Yue: "Correo para Manuel
            # Delgado" se desmarcó pero sus ítems sembrados -- Tarea1, un
            # pendiente -- se quedaban activos para siempre, como
            # fantasmas). Sin esto, _sembrar_entregables_notas_pendientes
            # solo agrega, nunca limpia lo que ya no aplica.
            if pid is not None:
                db.query(AgendaItem).filter(
                    filtro,
                    AgendaItem.seccion_proyecto_id == pid,
                    AgendaItem.tipo.in_(
                        [TipoAgendaItem.entregable, TipoAgendaItem.nota, TipoAgendaItem.pendiente]
                    ),
                    AgendaItem.activo.is_(True),
                ).update({AgendaItem.activo: False}, synchronize_session=False)

    # Savepoint por ítem + índice único parcial en BD
    # (ix_agenda_items_tema_activo_unico, ver migración 87ff0608e076): si
    # dos peticiones casi simultáneas llegan aquí a la vez (mismo tema
    # marcado dos veces seguidas muy rápido), ambas pueden pasar el chequeo
    # en memoria de arriba antes de que la otra haga commit -- sin esto,
    # la segunda tronaría con IntegrityError y toda la petición fallaría.
    # Con el savepoint, si eso pasa simplemente se descarta ese intento (el
    # resultado deseado -- un tema activo para ese proyecto -- ya lo dejó
    # la petición concurrente).
    for pid in deseados - set(activos_por_proyecto.keys()):
        try:
            with db.begin_nested():
                agregar_item_agenda(
                    db, usuario, serie_id, tipo=TipoAgendaItem.tema, reunion_id=reunion_id, proyecto_id=pid
                )
        except IntegrityError:
            pass

    _sembrar_entregables_notas_pendientes(db, usuario, serie_id, reunion_id, list(deseados))


def revertir_revision_tema(db: Session, usuario: Usuario, agenda_item_id: int) -> None:
    """Deshace un "Marcar revisado" hecho por error (2026-08-18, botón
    "Revertir" en la pestaña Historial) -- vuelve a dejar el tema activo
    (pendiente) en la junta a la que pertenecía ese ítem, con el mismo
    mecanismo que "+ Agregar tema a esta agenda" (agregar_item_agenda ya
    siembra su contenido solo). El registro de que se marcó revisado por
    error NO se borra -- AgendaItemRevision es la bitácora, se queda como
    historial de todas formas."""
    item = db.query(AgendaItem).filter(AgendaItem.id == agenda_item_id).first()
    if not item or item.tipo != TipoAgendaItem.tema or item.proyecto_id is None:
        raise HTTPException(status_code=404, detail="Tema no encontrado")
    if item.activo:
        return  # ya está pendiente, nada que revertir
    agregar_item_agenda(
        db,
        usuario,
        item.serie_id,
        tipo=TipoAgendaItem.tema,
        reunion_id=item.reunion_id,
        proyecto_id=item.proyecto_id,
    )


HORIZONTE_ENTREGABLES_DIAS = 14


def _sembrar_entregables_notas_pendientes(
    db: Session,
    usuario: Usuario,
    serie_id: int | None,
    reunion_id: int | None,
    proyecto_ids: list[int],
) -> None:
    """Auto-siembra entregables próximos, notas y pendientes de los temas
    marcados -- reemplaza por completo el picker manual "Agregar punto a
    la agenda" (2026-08-18, a petición de Yue: marcar un tema ya trae lo
    relevante, sin agregarlo uno por uno). Mismo patrón que
    app.services.minuta_1a1._sembrar_items_1a1, generalizado a cualquier
    junta -- a diferencia de esa, aquí no se filtra por responsable (no
    hay un "reporte" único, se listan los entregables de CUALQUIER
    responsable bajo esos temas). Idempotente: deduplica contra CUALQUIER
    ítem ya existente (activo o archivado), para no resucitar algo que ya
    se marcó revisado."""
    if not proyecto_ids:
        return
    filtro = AgendaItem.serie_id == serie_id if serie_id is not None else AgendaItem.reunion_id == reunion_id
    existentes = db.query(AgendaItem).filter(filtro).all()
    entregables_existentes = {i.entregable_id for i in existentes if i.tipo == TipoAgendaItem.entregable}
    notas_existentes = {i.nota_id for i in existentes if i.tipo == TipoAgendaItem.nota}
    pendientes_existentes = {i.pendiente_id for i in existentes if i.tipo == TipoAgendaItem.pendiente}

    limite = date.today() + timedelta(days=HORIZONTE_ENTREGABLES_DIAS)
    entregables = (
        db.query(Entregable)
        .filter(
            Entregable.proyecto_id.in_(proyecto_ids),
            Entregable.estatus != EstatusEntregable.cumplido,
            Entregable.fecha_entrega <= limite,
        )
        .all()
    )
    for e in entregables:
        if e.id in entregables_existentes:
            continue
        agregar_item_agenda(
            db, usuario, serie_id, tipo=TipoAgendaItem.entregable, reunion_id=reunion_id,
            entregable_id=e.id, seccion_proyecto_id=e.proyecto_id,
        )

    for n in db.query(Nota).filter(Nota.proyecto_id.in_(proyecto_ids)).all():
        if n.id in notas_existentes:
            continue
        agregar_item_agenda(
            db, usuario, serie_id, tipo=TipoAgendaItem.nota, reunion_id=reunion_id,
            nota_id=n.id, seccion_proyecto_id=n.proyecto_id,
        )

    for p in db.query(Pendiente).filter(Pendiente.proyecto_id.in_(proyecto_ids)).all():
        if p.id in pendientes_existentes:
            continue
        agregar_item_agenda(
            db, usuario, serie_id, tipo=TipoAgendaItem.pendiente, reunion_id=reunion_id,
            pendiente_id=p.id, seccion_proyecto_id=p.proyecto_id,
        )

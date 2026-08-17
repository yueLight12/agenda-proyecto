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
from datetime import date, datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.permissions import (
    obtener_rol_en_proyecto,
    puede_editar_reunion,
    query_reuniones_generales_visibles,
    query_reuniones_visibles,
    requerir_participacion_en_proyecto,
)
from app.models.agenda_item import AgendaItem, AgendaItemRevision, EstadoRevision, TipoAgendaItem
from app.models.reunion import Reunion
from app.models.serie_reunion import SerieReunion, SerieReunionParticipante
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


def puede_editar_serie(db: Session, usuario: Usuario, serie: SerieReunion) -> bool:
    """Mismo criterio que puede_editar_reunion: N1/N2 (local o heredado)
    del tema, o el organizador. Una serie general (proyecto_id None) solo
    la edita su organizador (o super_admin)."""
    if usuario.es_super_admin:
        return True
    if serie.proyecto_id is None:
        return serie.organizador_id == usuario.id
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
        organizador_id=serie.organizador_id,
        organizador_nombre=serie.organizador.nombre,
        dia_semana=serie.dia_semana,
        hora=serie.hora,
        duracion_minutos=serie.duracion_minutos,
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


def crear_serie(
    db: Session,
    usuario: Usuario,
    proyecto_id: int | None,
    titulo: str,
    dia_semana: int,
    hora,
    duracion_minutos: int,
    participantes_ids: list[int],
    fecha_inicio: date,
    fecha_fin: date | None,
) -> SerieReunion:
    """Cualquier participante del tema puede proponer una serie -- mismo
    criterio que crear_reunion, no requiere N1/N2."""
    if proyecto_id is not None:
        requerir_participacion_en_proyecto(db, usuario, proyecto_id)

    nueva = SerieReunion(
        proyecto_id=proyecto_id,
        titulo=titulo,
        organizador_id=usuario.id,
        dia_semana=dia_semana,
        hora=hora,
        duracion_minutos=duracion_minutos,
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
    for campo, valor in campos.items():
        if valor is not None:
            setattr(serie, campo, valor)

    if participantes_ids is not None:
        db.query(SerieReunionParticipante).filter(
            SerieReunionParticipante.serie_id == serie.id
        ).delete()
        for uid in set(participantes_ids) - {serie.organizador_id}:
            db.add(SerieReunionParticipante(serie_id=serie.id, usuario_id=uid))

    return serie


def eliminar_serie(db: Session, usuario: Usuario, serie_id: int) -> None:
    """Elimina la serie y su agenda persistente (cascade). Las ocurrencias
    YA materializadas (Reunion.serie_id) NO se borran -- quedan como
    reuniones sueltas normales, con su historial intacto; solo se les
    limpia la referencia a la serie eliminada."""
    serie = obtener_serie_o_404(db, serie_id)
    if not puede_editar_serie(db, usuario, serie):
        raise HTTPException(status_code=403, detail="No tienes permiso para eliminar esta serie")

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
        tipo=item.tipo,
        nombre=_nombre_agenda_item(item),
        detalle=item.detalle,
        seccion_proyecto_id=item.seccion_proyecto_id,
        seccion_nombre=item.seccion.nombre if item.seccion else None,
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


def agregar_item_agenda(
    db: Session,
    usuario: Usuario,
    serie_id: int,
    tipo: TipoAgendaItem,
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
    serie = obtener_serie_o_404(db, serie_id)
    if not puede_editar_serie(db, usuario, serie):
        raise HTTPException(
            status_code=403, detail="No tienes permiso para editar la agenda de esta serie"
        )

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
        .filter(AgendaItem.serie_id == serie_id)
        .count()
    )
    item = AgendaItem(
        serie_id=serie_id,
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
    serie = obtener_serie_o_404(db, item.serie_id)
    if not puede_editar_serie(db, usuario, serie):
        raise HTTPException(
            status_code=403, detail="No tienes permiso para editar la agenda de esta serie"
        )
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
    serie = obtener_serie_o_404(db, item.serie_id)
    if not puede_editar_serie(db, usuario, serie):
        raise HTTPException(
            status_code=403, detail="No tienes permiso para editar la agenda de esta serie"
        )
    if direccion not in ("arriba", "abajo"):
        raise HTTPException(status_code=400, detail="direccion debe ser 'arriba' o 'abajo'")

    hermanos = (
        db.query(AgendaItem)
        .filter(
            AgendaItem.serie_id == item.serie_id,
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
    revisiones (la bitácora de lo que se habló no debe desaparecer)."""
    item = db.query(AgendaItem).filter(AgendaItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Ítem de agenda no encontrado")
    serie = obtener_serie_o_404(db, item.serie_id)
    if not puede_editar_serie(db, usuario, serie):
        raise HTTPException(
            status_code=403, detail="No tienes permiso para editar la agenda de esta serie"
        )
    item.activo = False

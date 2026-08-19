"""
Historial de minutas -- vista global semanal de qué se revisó, qué es
nuevo y qué sigue pendiente, cruzando TODAS las juntas donde participa el
usuario (no una junta a la vez). No existe ninguna tabla "Minuta"/"Semana"
propia -- se arma de solo lectura sobre AgendaItem/AgendaItemRevision, la
misma bitácora que ya alimenta el checklist sticky de Vista Equipo (ver
app/services/minutas.py). Confirmado con Yue (2026-08-18): vista global
por semana, con navegación ◀/▶, no por junta individual.
"""
from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from app.core.permissions import puede_ver_reunion
from app.models.agenda_item import AgendaItem, AgendaItemRevision, EstadoRevision, TipoAgendaItem
from app.models.reunion import Reunion
from app.models.usuario import Usuario
from app.schemas.serie_reunion import EventoHistorialOut, HistorialSemanaOut


def _rango_semana(fecha_referencia: date) -> tuple[date, date]:
    """Lunes a domingo (ISO) que contiene fecha_referencia -- mismo
    criterio que semanaActual() en el frontend (utils/fechas.js)."""
    inicio = fecha_referencia - timedelta(days=fecha_referencia.weekday())
    fin = inicio + timedelta(days=6)
    return inicio, fin


def _numero_semana(fecha_referencia: date) -> int:
    return fecha_referencia.isocalendar()[1]


def _nombre_tema(item: AgendaItem) -> str:
    if item.tipo == TipoAgendaItem.tema:
        return item.proyecto.nombre if item.proyecto else "(tema eliminado)"
    return item.texto or "(sin nombre)"


def _junta_titulo(item: AgendaItem) -> str:
    if item.serie_id is not None:
        return item.serie.titulo if item.serie else "(junta eliminada)"
    return item.reunion.titulo if item.reunion else "(junta eliminada)"


def _reunion_visible_de_item(db: Session, usuario: Usuario, item: AgendaItem) -> Reunion | None:
    """Una ocurrencia cualquiera visible para `usuario` de la junta a la
    que pertenece este ítem -- mismo criterio de visibilidad que el resto
    del sistema (puede_ver_reunion), sin regla nueva. Usada tanto para
    decidir si el ítem entra al historial como para el nombre de la junta
    en juntas sueltas."""
    if item.reunion_id is not None:
        reunion = item.reunion
        return reunion if reunion and puede_ver_reunion(db, usuario, reunion) else None
    if item.serie_id is not None:
        ocurrencias = db.query(Reunion).filter(Reunion.serie_id == item.serie_id).all()
        for ocurrencia in ocurrencias:
            if puede_ver_reunion(db, usuario, ocurrencia):
                return ocurrencia
    return None


def historial_semana(db: Session, usuario: Usuario, fecha_referencia: date) -> HistorialSemanaOut:
    inicio, fin = _rango_semana(fecha_referencia)
    inicio_dt = datetime.combine(inicio, datetime.min.time())
    fin_dt = datetime.combine(fin, datetime.max.time())

    # --- Revisado esta semana (incluye "revisado, con pendientes nuevos" --
    # técnicamente se atendió, aunque el tema en sí siga abierto) ---------
    revisiones = (
        db.query(AgendaItemRevision)
        .filter(
            AgendaItemRevision.estado.in_(
                [EstadoRevision.revisado, EstadoRevision.revisado_con_pendientes]
            ),
            AgendaItemRevision.fecha_registro >= inicio_dt,
            AgendaItemRevision.fecha_registro <= fin_dt,
        )
        .all()
    )
    revisados: list[EventoHistorialOut] = []
    for revision in revisiones:
        item = revision.agenda_item
        if not item or not _reunion_visible_de_item(db, usuario, item):
            continue
        revisados.append(
            EventoHistorialOut(
                tema_nombre=_nombre_tema(item),
                junta_titulo=_junta_titulo(item),
                reunion_id=revision.reunion_id,
                usuario_nombre=revision.usuario.nombre if revision.usuario else None,
                estado=revision.estado,
                nota=revision.nota,
                fecha=revision.fecha_registro,
                agenda_item_id=item.id if item.tipo == TipoAgendaItem.tema else None,
                proyecto_id=item.proyecto_id if item.tipo == TipoAgendaItem.tema else None,
            )
        )
    revisados.sort(key=lambda e: e.fecha, reverse=True)

    # --- Nuevo esta semana (ítems tipo=tema agregados en el rango) -------
    items_nuevos = (
        db.query(AgendaItem)
        .filter(
            AgendaItem.tipo == TipoAgendaItem.tema,
            AgendaItem.fecha_creacion >= inicio_dt,
            AgendaItem.fecha_creacion <= fin_dt,
        )
        .all()
    )
    nuevos: list[EventoHistorialOut] = []
    ids_nuevos: set[int] = set()
    for item in items_nuevos:
        reunion = _reunion_visible_de_item(db, usuario, item)
        if not reunion:
            continue
        ids_nuevos.add(item.id)
        nuevos.append(
            EventoHistorialOut(
                tema_nombre=_nombre_tema(item),
                junta_titulo=_junta_titulo(item),
                reunion_id=reunion.id,
                usuario_nombre=None,
                estado=None,
                nota=None,
                fecha=item.fecha_creacion,
                proyecto_id=item.proyecto_id,
            )
        )
    nuevos.sort(key=lambda e: e.fecha, reverse=True)

    # --- Sigue pendiente al cierre de esta semana -------------------------
    # Activos sin ninguna revisión "revisado"/"revisado_con_pendientes" DENTRO
    # de este rango -- lo agregado en la semana ya se cuenta arriba como
    # "nuevo", no se repite aquí.
    items_activos = (
        db.query(AgendaItem)
        .filter(
            AgendaItem.tipo == TipoAgendaItem.tema,
            AgendaItem.activo.is_(True),
            AgendaItem.fecha_creacion <= fin_dt,
        )
        .all()
    )
    ids_atendidos_en_semana = {
        r.agenda_item_id
        for r in revisiones
    }
    pendientes: list[EventoHistorialOut] = []
    for item in items_activos:
        if item.id in ids_nuevos or item.id in ids_atendidos_en_semana:
            continue
        reunion = _reunion_visible_de_item(db, usuario, item)
        if not reunion:
            continue
        pendientes.append(
            EventoHistorialOut(
                tema_nombre=_nombre_tema(item),
                junta_titulo=_junta_titulo(item),
                reunion_id=reunion.id,
                usuario_nombre=None,
                estado=EstadoRevision.pendiente,
                nota=None,
                fecha=item.fecha_creacion,
                proyecto_id=item.proyecto_id,
            )
        )
    pendientes.sort(key=lambda e: e.tema_nombre)

    return HistorialSemanaOut(
        numero_semana=_numero_semana(inicio),
        fecha_inicio=inicio,
        fecha_fin=fin,
        revisados=revisados,
        nuevos=nuevos,
        pendientes=pendientes,
    )

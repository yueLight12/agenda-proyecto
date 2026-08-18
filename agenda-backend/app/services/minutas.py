"""
Servicio de minutas y acuerdos: crear/actualizar minuta, agregar acuerdo,
convertir un acuerdo en Entregable real. Usado por el router REST
(app/routers/minutas.py) y por el asistente de voz (app/services/asistente/).

La visibilidad de una minuta es la misma que la de su reunión (reutiliza
puede_ver_reunion de app.core.permissions). Editar el CONTENIDO de la
minuta (notas y acuerdos) usa puede_editar_minuta — más permisiva que
puede_editar_reunion: cualquier invitado puede aportar a la minuta, no solo
N1/N2/organizador (la reunión en sí — título/fecha/participantes — sigue
protegida por puede_editar_reunion sin cambios, ver ModalReunion/reuniones.py).
Convertir un acuerdo en entregable reutiliza
app.services.entregables.crear_entregable, la misma lógica y notificaciones
que usa la creación normal de entregables.
"""
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.permissions import (
    puede_editar_minuta,
    puede_ver_reunion,
    requerir_participacion_en_proyecto,
)
from app.models.agenda_item import AgendaItem, AgendaItemRevision, EstadoRevision, TipoAgendaItem
from app.models.minuta import AcuerdoMinuta, Minuta
from app.models.reunion import Reunion
from app.schemas.minuta import AcuerdoOut, MinutaOut
from app.schemas.serie_reunion import PendienteRevisionOut, RevisionAgendaItemOut
from app.services.entregables import crear_entregable
from app.services.proyectos import obtener_proyecto_o_404
from app.services.reuniones import obtener_reunion_o_404
from app.services.series_reunion import item_a_out
from app.models.usuario import Usuario


def acuerdo_a_out(acuerdo: AcuerdoMinuta) -> AcuerdoOut:
    return AcuerdoOut(
        id=acuerdo.id,
        descripcion=acuerdo.descripcion,
        responsable_id=acuerdo.responsable_id,
        responsable_nombre=acuerdo.responsable.nombre if acuerdo.responsable else None,
        entregable_id=acuerdo.entregable_id,
        convertido=acuerdo.convertido,
    )


def minuta_a_out(minuta: Minuta) -> MinutaOut:
    return MinutaOut(
        id=minuta.id,
        reunion_id=minuta.reunion_id,
        contenido=minuta.contenido,
        creado_por=minuta.creado_por,
        fecha_actualizacion=minuta.fecha_actualizacion,
        acuerdos=[acuerdo_a_out(a) for a in minuta.acuerdos],
    )


def listar_acuerdos_de_proyecto(db: Session, usuario: Usuario, proyecto_id: int) -> list[AcuerdoMinuta]:
    """Acuerdos de todas las minutas de reuniones ligadas directamente a
    este tema/subtema -- pensado para el picker de "agregar punto" del
    checklist de una junta recurrente (tipo=acuerdo). Mismo criterio de
    visibilidad que el picker de nota/entregable por sección: participar en
    el tema, no el permiso de cada reunión individual."""
    obtener_proyecto_o_404(db, proyecto_id)
    requerir_participacion_en_proyecto(db, usuario, proyecto_id)
    return (
        db.query(AcuerdoMinuta)
        .join(Minuta, AcuerdoMinuta.minuta_id == Minuta.id)
        .join(Reunion, Minuta.reunion_id == Reunion.id)
        .filter(Reunion.proyecto_id == proyecto_id)
        .order_by(AcuerdoMinuta.fecha_creacion.asc())
        .all()
    )


def obtener_minuta_o_404(db: Session, minuta_id: int) -> Minuta:
    minuta = db.query(Minuta).filter(Minuta.id == minuta_id).first()
    if not minuta:
        raise HTTPException(status_code=404, detail="Minuta no encontrada")
    return minuta


def crear_o_actualizar_minuta(
    db: Session, usuario: Usuario, reunion_id: int, contenido: str | None
) -> Minuta:
    """Crea la minuta de la reunión, o actualiza su contenido si ya existía."""
    reunion = obtener_reunion_o_404(db, reunion_id)
    if not puede_editar_minuta(db, usuario, reunion):
        raise HTTPException(status_code=403, detail="No tienes permiso para editar esta minuta")

    minuta = db.query(Minuta).filter(Minuta.reunion_id == reunion_id).first()
    if minuta:
        minuta.contenido = contenido
    else:
        minuta = Minuta(reunion_id=reunion_id, contenido=contenido, creado_por=usuario.id)
        db.add(minuta)

    return minuta


def agregar_acuerdo(
    db: Session, usuario: Usuario, minuta_id: int, descripcion: str, responsable_id: int | None
) -> AcuerdoMinuta:
    minuta = obtener_minuta_o_404(db, minuta_id)
    if not puede_editar_minuta(db, usuario, minuta.reunion):
        raise HTTPException(status_code=403, detail="No tienes permiso para editar esta minuta")

    acuerdo = AcuerdoMinuta(
        minuta_id=minuta_id,
        descripcion=descripcion,
        responsable_id=responsable_id,
    )
    db.add(acuerdo)
    return acuerdo


def eliminar_acuerdo(db: Session, usuario: Usuario, acuerdo_id: int) -> None:
    acuerdo = db.query(AcuerdoMinuta).filter(AcuerdoMinuta.id == acuerdo_id).first()
    if not acuerdo:
        raise HTTPException(status_code=404, detail="Acuerdo no encontrado")
    if not puede_editar_minuta(db, usuario, acuerdo.minuta.reunion):
        raise HTTPException(status_code=403, detail="No tienes permiso para editar esta minuta")
    db.delete(acuerdo)


def convertir_acuerdo_a_entregable(
    db: Session, usuario: Usuario, acuerdo_id: int, fecha_entrega, sensible: bool
) -> AcuerdoMinuta:
    """
    Crea un Entregable a partir de este acuerdo (mismo responsable y
    descripción) y lo enlaza. Reutiliza la misma regla que crear un
    entregable normal: N1/N2 pueden asignarlo a quien sea de su equipo,
    N3/N4 solo pueden convertir acuerdos donde ellos son el responsable.
    """
    acuerdo = db.query(AcuerdoMinuta).filter(AcuerdoMinuta.id == acuerdo_id).first()
    if not acuerdo:
        raise HTTPException(status_code=404, detail="Acuerdo no encontrado")
    if acuerdo.convertido:
        raise HTTPException(status_code=400, detail="Este acuerdo ya fue convertido en entregable")
    if not acuerdo.responsable_id:
        raise HTTPException(
            status_code=400, detail="El acuerdo necesita un responsable antes de convertirlo"
        )

    reunion = acuerdo.minuta.reunion
    if not puede_ver_reunion(db, usuario, reunion):
        raise HTTPException(status_code=403, detail="No tienes acceso a esta reunión")
    if reunion.proyecto_id is None:
        # Reunión "general" (sin tema/proyecto, 2026-08-16) -- un Entregable
        # siempre necesita un proyecto_id real (NOT NULL), así que no hay
        # dónde crearlo. Mensaje explícito en vez de dejar que
        # requerir_participacion_en_proyecto truene con un 403 genérico.
        raise HTTPException(
            status_code=400,
            detail="Esta reunión es general (sin tema), no se puede convertir un acuerdo "
            "suyo en entregable -- conviértelo desde una reunión ligada a un tema.",
        )

    rol = requerir_participacion_en_proyecto(db, usuario, reunion.proyecto_id)

    nuevo = crear_entregable(
        db,
        reunion.proyecto_id,
        usuario,
        rol,
        nombre=acuerdo.descripcion[:200],
        descripcion=f'Acuerdo de la minuta de "{reunion.titulo}".',
        responsable_id=acuerdo.responsable_id,
        fecha_entrega=fecha_entrega,
        sensible=sensible,
    )
    db.flush()

    acuerdo.entregable_id = nuevo.id
    acuerdo.convertido = True
    return acuerdo


def registrar_revision_agenda_item(
    db: Session,
    usuario: Usuario,
    reunion_id: int,
    agenda_item_id: int,
    estado: EstadoRevision,
    nota: str | None,
    nuevo_pendiente_texto: str | None,
) -> RevisionAgendaItemOut:
    """
    Marca el estado de un ítem de la agenda persistente de la serie EN esta
    ocurrencia puntual (revisado / pendiente / revisado_con_pendientes) --
    la bitácora de Fase 2/3. Mismo permiso que editar la minuta
    (puede_editar_minuta: cualquier invitado de la reunión, no solo
    N1/N2/organizador) ya que es la misma idea de "dejar constancia de lo
    que se habló", aplicada a la agenda persistente en vez de a un acuerdo
    suelto.

    Si se manda `nuevo_pendiente_texto`, además crea un AgendaItem nuevo
    (tipo=pendiente) enganchado a la MISMA serie, para que lo que surgió
    en la plática quede listo para la siguiente ocurrencia sin que haya
    que agregarlo aparte.
    """
    reunion = obtener_reunion_o_404(db, reunion_id)
    if not puede_editar_minuta(db, usuario, reunion):
        raise HTTPException(
            status_code=403, detail="No tienes permiso para editar la agenda de esta reunión"
        )

    item = db.query(AgendaItem).filter(AgendaItem.id == agenda_item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Ítem de agenda no encontrado")
    # Un AgendaItem cuelga de una serie O de una reunión suelta (nunca
    # ambas) -- validar contra el padre que corresponda. Antes esto solo
    # comparaba serie_id, que para una reunión suelta (ambos None) pasaba
    # sin verificar de verdad que el ítem fuera de ESTA reunión.
    if item.serie_id is not None:
        if item.serie_id != reunion.serie_id:
            raise HTTPException(
                status_code=400, detail="Este ítem no pertenece a la serie de esta reunión"
            )
    elif item.reunion_id != reunion.id:
        raise HTTPException(
            status_code=400, detail="Este ítem no pertenece a esta reunión"
        )

    revision = AgendaItemRevision(
        agenda_item_id=item.id,
        reunion_id=reunion.id,
        estado=estado,
        nota=nota,
        registrado_por=usuario.id,
    )
    db.add(revision)
    db.flush()

    # Un ítem revisado se archiva, así lo cerrado no vuelve a aparecer la
    # siguiente semana -- lo no revisado sigue pendiente automáticamente
    # (ver AgendaItemRevision más reciente en agenda_actual_de_serie).
    # Generalizado 2026-08-18 (antes solo aplicaba a es_agenda_1a1, el
    # checklist 1:1) a CUALQUIER junta recurrente -- mismo criterio
    # "sticky" que ya tiene desmarcar un tema en el árbol de checkboxes
    # (SelectorTemasChecklist): reportado por Yue, marcar revisado un tema
    # seguía apareciendo pendiente en las siguientes juntas generales.
    if estado == EstadoRevision.revisado:
        if item.tipo == TipoAgendaItem.tema and item.proyecto_id:
            # Un tema es una entidad compartida, no propiedad de una junta
            # en particular (2026-08-18, a petición de Yue: "revisar un
            # tema en cualquier junta debe quitarlo de todas") -- archiva
            # TODAS las copias activas de este mismo proyecto_id
            # (tipo=tema), sin importar en qué serie/reunión estén, para
            # que desaparezca de cualquier otra junta donde también se
            # haya agregado. Entregables/notas/pendientes NO comparten este
            # comportamiento a propósito -- cada junta sigue rastreando su
            # propia copia por separado, sin cambios.
            db.query(AgendaItem).filter(
                AgendaItem.proyecto_id == item.proyecto_id,
                AgendaItem.tipo == TipoAgendaItem.tema,
                AgendaItem.activo.is_(True),
            ).update({AgendaItem.activo: False}, synchronize_session=False)
            # El UPDATE en bloque no refresca el objeto ya cargado en la
            # sesión -- sin esto, el resto de esta función (o el caller)
            # podría seguir leyendo item.activo=True desde el identity map.
            db.expire(item)
        elif item.serie_id:
            # Solo aplica a ítems de una SERIE -- una reunión suelta no se
            # repite, ahí "revisado" ya solo es un registro histórico.
            item.activo = False

    nuevo_item = None
    if nuevo_pendiente_texto:
        nuevo_item = AgendaItem(
            serie_id=item.serie_id,
            reunion_id=item.reunion_id,
            tipo=TipoAgendaItem.pendiente,
            texto=nuevo_pendiente_texto,
            orden=item.orden + 1,
            creado_en_reunion_id=reunion.id,
        )
        db.add(nuevo_item)
        db.flush()

    return RevisionAgendaItemOut(
        id=revision.id,
        agenda_item_id=revision.agenda_item_id,
        estado=revision.estado,
        nota=revision.nota,
        fecha_registro=revision.fecha_registro,
        nuevo_item=item_a_out(nuevo_item) if nuevo_item else None,
    )


def listar_pendientes_revision(db: Session, usuario: Usuario) -> list[PendienteRevisionOut]:
    """Temas con un ítem de agenda todavía activo (no revisado) en alguna
    junta donde el usuario puede editar la minuta -- para el botón "Marcar
    revisado" directo desde Vista Equipo (2026-08-18, a petición de Yue:
    "no quiero tener que ir a buscar la reunión para marcarlo").

    Un tema puede estar agregado a varias juntas (series o reuniones
    sueltas); solo hace falta UNA reunión concreta para poder llamar al
    mismo endpoint de revisión de siempre (registrar_revision_agenda_item),
    que ya archiva la copia en TODAS las juntas donde esté (ver arriba) --
    así que aquí basta con encontrar, por cada proyecto_id, una sola
    reunión donde el usuario tenga permiso de editar la minuta
    (puede_editar_minuta, mismo gate que ya protege ese endpoint). Si el
    usuario no puede editar la minuta de NINGUNA junta donde el tema esté
    agregado, el tema simplemente no aparece aquí -- no se le ofrece un
    botón que le daría 403 al usarlo.
    """
    from datetime import date

    items = (
        db.query(AgendaItem)
        .filter(
            AgendaItem.tipo == TipoAgendaItem.tema,
            AgendaItem.activo.is_(True),
            AgendaItem.proyecto_id.isnot(None),
        )
        .all()
    )

    hoy = date.today()
    resultado: dict[int, PendienteRevisionOut] = {}
    for item in items:
        if item.proyecto_id in resultado:
            continue

        reunion = None
        if item.reunion_id is not None:
            candidata = db.query(Reunion).filter(Reunion.id == item.reunion_id).first()
            if candidata and puede_editar_minuta(db, usuario, candidata):
                reunion = candidata
        elif item.serie_id is not None:
            ocurrencias = db.query(Reunion).filter(Reunion.serie_id == item.serie_id).all()
            visibles = [r for r in ocurrencias if puede_editar_minuta(db, usuario, r)]
            if visibles:
                # La ocurrencia más cercana a hoy -- mismo criterio que ya
                # usa el asistente de voz para resolver "esta reunión" de
                # una serie (ver app/services/asistente/tools.py).
                reunion = min(visibles, key=lambda r: abs((r.fecha_inicio.date() - hoy).days))

        if reunion is None:
            continue

        resultado[item.proyecto_id] = PendienteRevisionOut(
            proyecto_id=item.proyecto_id,
            proyecto_nombre=item.proyecto.nombre if item.proyecto else "(tema eliminado)",
            item_id=item.id,
            reunion_id=reunion.id,
        )

    return list(resultado.values())


def listar_temas_resueltos(db: Session) -> list[int]:
    """proyecto_id de temas que YA tuvieron algo agendado en alguna junta y
    quedaron revisados, sin nada pendiente actualmente en ninguna otra --
    2026-08-18, a petición de Yue: un tema resuelto se oculta del árbol de
    Vista Equipo hasta que algo nuevo quede pendiente ahí otra vez (mismo
    ciclo semanal que ya trabajan a mano: lo resuelto sale de la vista, lo
    nuevo o lo que sigue pendiente se queda). Un tema que NUNCA se ha
    agregado a ninguna junta NO cuenta como "resuelto" -- sigue
    mostrándose, porque todavía nadie decidió si se agenda o no.

    No aplica ningún chequeo de permisos: solo describe un estado
    estructural (qué proyecto_ids ya no tienen ningún AgendaItem tipo=tema
    activo, habiendo tenido alguno antes) -- el filtrado real de qué temas
    puede VER cada quien lo sigue haciendo /equipo/resumen como siempre;
    esta lista solo se usa para OCULTAR del lado del cliente, nunca para
    mostrar algo que no fuera visible ya.
    """
    archivados = {
        pid
        for (pid,) in db.query(AgendaItem.proyecto_id)
        .filter(
            AgendaItem.tipo == TipoAgendaItem.tema,
            AgendaItem.activo.is_(False),
            AgendaItem.proyecto_id.isnot(None),
        )
        .distinct()
        .all()
    }
    activos = {
        pid
        for (pid,) in db.query(AgendaItem.proyecto_id)
        .filter(
            AgendaItem.tipo == TipoAgendaItem.tema,
            AgendaItem.activo.is_(True),
            AgendaItem.proyecto_id.isnot(None),
        )
        .distinct()
        .all()
    }
    return sorted(archivados - activos)

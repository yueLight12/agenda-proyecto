"""
Router de series de reuniones recurrentes + agenda persistente. Toda la
lógica vive en app.services.series_reunion -- este router solo valida el
schema de entrada y arma la respuesta.
"""
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import obtener_usuario_actual
from app.models.agenda_item import AgendaItem
from app.models.usuario import Usuario
from app.schemas.proyecto import ProyectoArbolOut
from app.schemas.serie_reunion import (
    ActualizarTemasRequest,
    AgendaItemActualizar,
    AgendaItemCrear,
    AgendaItemOut,
    MoverItemAgendaRequest,
    SerieReunionActualizar,
    SerieReunionCrear,
    SerieReunionOut,
)
from app.services.materializar_series import materializar_ocurrencias
from app.services.series_reunion import (
    actualizar_temas as actualizar_temas_servicio,
    agenda_actual_de_serie,
    agregar_item_agenda as agregar_item_agenda_servicio,
    archivar_item_agenda as archivar_item_agenda_servicio,
    arbol_temas_relevantes_de_junta,
    crear_serie as crear_serie_servicio,
    actualizar_serie as actualizar_serie_servicio,
    editar_item_agenda as editar_item_agenda_servicio,
    eliminar_serie as eliminar_serie_servicio,
    item_a_out,
    listar_series_visibles,
    mover_item_agenda as mover_item_agenda_servicio,
    obtener_serie_o_404,
    serie_a_out,
)

router = APIRouter(prefix="/series-reuniones", tags=["Series de reuniones"])


@router.get("", response_model=list[SerieReunionOut])
def listar_series(
    proyecto_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    series = listar_series_visibles(db, usuario, proyecto_id)
    return [serie_a_out(db, usuario, s) for s in series]


@router.post("", response_model=SerieReunionOut, status_code=status.HTTP_201_CREATED)
def crear_serie(
    datos: SerieReunionCrear,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    nueva = crear_serie_servicio(
        db,
        usuario,
        datos.proyecto_id,
        datos.titulo,
        datos.hora,
        datos.duracion_minutos,
        datos.participantes_ids,
        datos.fecha_inicio,
        datos.fecha_fin,
        tipo_recurrencia=datos.tipo_recurrencia,
        dia_semana=datos.dia_semana,
        dia_mes=datos.dia_mes,
    )
    db.commit()
    db.refresh(nueva)
    # Sin esto, la primera ocurrencia solo aparecía en el calendario hasta
    # el siguiente barrido del scheduler (cada
    # settings.horas_entre_barridos_recordatorios, hasta 6 horas) --
    # reportado por Yue como "agrego una reunión que se repite pero no se
    # agrega": la SerieReunion sí se creaba, pero no había ninguna Reunion
    # materializada todavía que mostrar en el calendario. Materializar aquí
    # mismo, justo tras crear la serie, hace que la primera ocurrencia
    # aparezca de inmediato.
    materializar_ocurrencias(db)
    return serie_a_out(db, usuario, nueva)


@router.patch("/{serie_id}", response_model=SerieReunionOut)
def actualizar_serie(
    serie_id: int,
    datos: SerieReunionActualizar,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    serie = actualizar_serie_servicio(db, usuario, serie_id, datos.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(serie)
    # Mismo motivo que en el POST de creación: si esto reactiva una serie
    # pausada (activa=False -> True, ej. "Activar junta 1:1"), sin esto la
    # primera ocurrencia no aparece hasta el siguiente barrido del
    # scheduler (hasta 6 horas). materializar_ocurrencias ya es idempotente
    # y filtra por activa=True, así que llamarla aquí siempre es seguro
    # aunque la serie siga pausada (no hace nada en ese caso).
    materializar_ocurrencias(db)
    return serie_a_out(db, usuario, serie)


@router.delete("/{serie_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_serie(
    serie_id: int,
    eliminar_ocurrencias: bool = Query(default=False),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    eliminar_serie_servicio(db, usuario, serie_id, eliminar_ocurrencias=eliminar_ocurrencias)
    db.commit()


@router.get("/{serie_id}/agenda", response_model=list[AgendaItemOut])
def obtener_agenda(
    serie_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    return agenda_actual_de_serie(db, usuario, serie_id)


@router.get("/{serie_id}/temas-relevantes", response_model=list[ProyectoArbolOut])
def obtener_temas_relevantes(
    serie_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """Árbol de temas acotado a organizador+invitados de esta serie, para
    el selector "Temas de esta junta" -- ver
    app.services.series_reunion.arbol_temas_relevantes_de_junta."""
    return arbol_temas_relevantes_de_junta(db, usuario, serie_id=serie_id)


@router.put("/{serie_id}/temas", status_code=status.HTTP_204_NO_CONTENT)
def actualizar_temas(
    serie_id: int,
    datos: ActualizarTemasRequest,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """Elige qué temas cubre esta junta en particular -- ver
    app.services.series_reunion.actualizar_temas."""
    actualizar_temas_servicio(db, usuario, serie_id, None, datos.proyecto_ids)
    db.commit()


@router.post(
    "/{serie_id}/agenda", response_model=AgendaItemOut, status_code=status.HTTP_201_CREATED
)
def agregar_item_agenda(
    serie_id: int,
    datos: AgendaItemCrear,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    item = agregar_item_agenda_servicio(
        db,
        usuario,
        serie_id,
        datos.tipo,
        proyecto_id=datos.proyecto_id,
        entregable_id=datos.entregable_id,
        acuerdo_id=datos.acuerdo_id,
        nota_id=datos.nota_id,
        nota_contenido=datos.nota_contenido,
        pendiente_id=datos.pendiente_id,
        pendiente_contenido=datos.pendiente_contenido,
        texto=datos.texto,
        detalle=datos.detalle,
        seccion_proyecto_id=datos.seccion_proyecto_id,
    )
    db.commit()
    db.refresh(item)
    return item_a_out(item)


@router.patch("/agenda-items/{item_id}", response_model=AgendaItemOut)
def editar_item_agenda(
    item_id: int,
    datos: AgendaItemActualizar,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    item = editar_item_agenda_servicio(db, usuario, item_id, datos.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(item)
    return item_a_out(item)


@router.post("/agenda-items/{item_id}/mover", response_model=AgendaItemOut)
def mover_item_agenda(
    item_id: int,
    datos: MoverItemAgendaRequest,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    mover_item_agenda_servicio(db, usuario, item_id, datos.direccion)
    db.commit()
    item = db.query(AgendaItem).filter(AgendaItem.id == item_id).first()
    return item_a_out(item)


@router.delete("/agenda-items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def archivar_item_agenda(
    item_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    archivar_item_agenda_servicio(db, usuario, item_id)
    db.commit()

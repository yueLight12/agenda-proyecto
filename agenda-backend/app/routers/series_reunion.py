"""
Router de series de reuniones recurrentes + agenda persistente. Toda la
lógica vive en app.services.series_reunion -- este router solo valida el
schema de entrada y arma la respuesta.
"""
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import obtener_usuario_actual
from app.models.usuario import Usuario
from app.schemas.serie_reunion import (
    AgendaItemCrear,
    AgendaItemOut,
    SerieReunionActualizar,
    SerieReunionCrear,
    SerieReunionOut,
)
from app.services.series_reunion import (
    agenda_actual_de_serie,
    agregar_item_agenda as agregar_item_agenda_servicio,
    archivar_item_agenda as archivar_item_agenda_servicio,
    crear_serie as crear_serie_servicio,
    actualizar_serie as actualizar_serie_servicio,
    eliminar_serie as eliminar_serie_servicio,
    item_a_out,
    listar_series_visibles,
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
        datos.dia_semana,
        datos.hora,
        datos.duracion_minutos,
        datos.participantes_ids,
        datos.fecha_inicio,
        datos.fecha_fin,
    )
    db.commit()
    db.refresh(nueva)
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
    return serie_a_out(db, usuario, serie)


@router.delete("/{serie_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_serie(
    serie_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    eliminar_serie_servicio(db, usuario, serie_id)
    db.commit()


@router.get("/{serie_id}/agenda", response_model=list[AgendaItemOut])
def obtener_agenda(
    serie_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    return agenda_actual_de_serie(db, usuario, serie_id)


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
        texto=datos.texto,
    )
    db.commit()
    db.refresh(item)
    return item_a_out(item)


@router.delete("/agenda-items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def archivar_item_agenda(
    item_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    archivar_item_agenda_servicio(db, usuario, item_id)
    db.commit()

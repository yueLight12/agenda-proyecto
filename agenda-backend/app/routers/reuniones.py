"""
Router de reuniones: alta/edición/borrado y consulta, con visibilidad
restringida a los involucrados (ver app.core.permissions.query_reuniones_visibles).

Reuniones "generales" (sin proyecto/tema, 2026-08-16 -- pedido explícito
del cliente, pendiente desde 2026-08-10): usan las mismas POST/GET pero
bajo el prefijo plano /reuniones en vez de /proyectos/{id}/reuniones,
reutilizando el mismo servicio con proyecto_id=None.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.permissions import (
    puede_ver_reunion,
    query_reuniones_generales_visibles,
    query_reuniones_visibles,
)
from app.database import get_db
from app.dependencies import obtener_usuario_actual
from app.models.reunion import Reunion
from app.models.usuario import Usuario
from app.schemas.reunion import ReunionActualizar, ReunionCrear, ReunionOut
from app.schemas.proyecto import MiembroEquipoOut, ProyectoArbolOut
from app.schemas.serie_reunion import ActualizarTemasRequest, AgendaItemCrear, AgendaItemOut
from app.services.reuniones import (
    actualizar_reunion as actualizar_reunion_servicio,
    crear_reunion as crear_reunion_servicio,
    eliminar_reunion as eliminar_reunion_servicio,
    listar_invitables_reunion as listar_invitables_reunion_servicio,
    reunion_a_out,
)
from app.services.series_reunion import (
    actualizar_temas as actualizar_temas_servicio,
    agenda_actual_de_reunion,
    agregar_item_agenda as agregar_item_agenda_servicio,
    arbol_temas_relevantes_de_junta,
    item_a_out,
)

router = APIRouter(tags=["Reuniones"])


@router.get("/proyectos/{proyecto_id}/reuniones", response_model=list[ReunionOut])
def listar_reuniones(
    proyecto_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    reuniones = query_reuniones_visibles(db, usuario, proyecto_id).all()
    return [reunion_a_out(db, usuario, r) for r in reuniones]


@router.post(
    "/proyectos/{proyecto_id}/reuniones",
    response_model=ReunionOut,
    status_code=status.HTTP_201_CREATED,
)
def crear_reunion(
    proyecto_id: int,
    datos: ReunionCrear,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    nueva = crear_reunion_servicio(
        db,
        usuario,
        proyecto_id,
        titulo=datos.titulo,
        notas=datos.notas,
        fecha_inicio=datos.fecha_inicio,
        duracion_minutos=datos.duracion_minutos,
        participantes_ids=datos.participantes_ids,
    )
    db.commit()
    db.refresh(nueva)
    return reunion_a_out(db, usuario, nueva)


@router.get("/reuniones", response_model=list[ReunionOut])
def listar_reuniones_generales(
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """Reuniones "generales" (sin tema/proyecto) donde el usuario es
    organizador o invitado."""
    reuniones = query_reuniones_generales_visibles(db, usuario).all()
    return [reunion_a_out(db, usuario, r) for r in reuniones]


@router.post("/reuniones", response_model=ReunionOut, status_code=status.HTTP_201_CREATED)
def crear_reunion_general(
    datos: ReunionCrear,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """Crea una reunión "general", sin tema/proyecto."""
    nueva = crear_reunion_servicio(
        db,
        usuario,
        None,
        titulo=datos.titulo,
        notas=datos.notas,
        fecha_inicio=datos.fecha_inicio,
        duracion_minutos=datos.duracion_minutos,
        participantes_ids=datos.participantes_ids,
    )
    db.commit()
    db.refresh(nueva)
    return reunion_a_out(db, usuario, nueva)


@router.get("/reuniones/invitables", response_model=list[MiembroEquipoOut])
def listar_invitables(
    proyecto_id: int | None = None,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """A quién se puede invitar a una reunión/junta -- más permisiva que
    /proyectos/{id}/usuarios (esa sigue siendo la fuente de verdad para
    "Administrar equipo"). Declarado ANTES de /reuniones/{reunion_id} para
    que FastAPI no intente resolver "invitables" como un id."""
    return listar_invitables_reunion_servicio(db, usuario, proyecto_id)


@router.get("/reuniones/{reunion_id}", response_model=ReunionOut)
def obtener_reunion(
    reunion_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    reunion = db.query(Reunion).filter(Reunion.id == reunion_id).first()
    if not reunion:
        raise HTTPException(status_code=404, detail="Reunión no encontrada")
    if not puede_ver_reunion(db, usuario, reunion):
        raise HTTPException(status_code=403, detail="No tienes acceso a esta reunión")
    return reunion_a_out(db, usuario, reunion)


@router.get("/reuniones/{reunion_id}/agenda", response_model=list[AgendaItemOut])
def obtener_agenda_reunion(
    reunion_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """Checklist propio de esta reunión suelta -- mismo concepto que la
    agenda persistente de una junta recurrente (ver
    /series-reuniones/{serie_id}/agenda), agregado 2026-08-17 para que
    ambos tipos de reunión funcionen parecido."""
    return agenda_actual_de_reunion(db, usuario, reunion_id)


@router.get("/reuniones/{reunion_id}/temas-relevantes", response_model=list[ProyectoArbolOut])
def obtener_temas_relevantes_reunion(
    reunion_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """Árbol de temas acotado a organizador+invitados de esta reunión, para
    el selector "Temas de esta junta" -- ver
    app.services.series_reunion.arbol_temas_relevantes_de_junta."""
    return arbol_temas_relevantes_de_junta(db, usuario, reunion_id=reunion_id)


@router.post(
    "/reuniones/{reunion_id}/agenda", response_model=AgendaItemOut, status_code=status.HTTP_201_CREATED
)
def agregar_item_agenda_reunion(
    reunion_id: int,
    datos: AgendaItemCrear,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    item = agregar_item_agenda_servicio(
        db,
        usuario,
        None,
        datos.tipo,
        reunion_id=reunion_id,
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


@router.put("/reuniones/{reunion_id}/temas", status_code=status.HTTP_204_NO_CONTENT)
def actualizar_temas_reunion(
    reunion_id: int,
    datos: ActualizarTemasRequest,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """Elige qué temas cubre esta reunión suelta -- ver
    app.services.series_reunion.actualizar_temas."""
    actualizar_temas_servicio(db, usuario, None, reunion_id, datos.proyecto_ids)
    db.commit()


@router.patch("/reuniones/{reunion_id}", response_model=ReunionOut)
def actualizar_reunion(
    reunion_id: int,
    datos: ReunionActualizar,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    reunion = actualizar_reunion_servicio(
        db, usuario, reunion_id, datos.model_dump(exclude_unset=True)
    )
    db.commit()
    db.refresh(reunion)
    return reunion_a_out(db, usuario, reunion)


@router.delete("/reuniones/{reunion_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_reunion(
    reunion_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    eliminar_reunion_servicio(db, usuario, reunion_id)
    db.commit()

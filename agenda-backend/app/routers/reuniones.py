"""
Router de reuniones: alta/edición/borrado y consulta, con visibilidad
restringida a los involucrados (ver app.core.permissions.query_reuniones_visibles).
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.permissions import puede_ver_reunion, query_reuniones_visibles
from app.database import get_db
from app.dependencies import obtener_usuario_actual
from app.models.reunion import Reunion
from app.models.usuario import Usuario
from app.schemas.reunion import ReunionActualizar, ReunionCrear, ReunionOut
from app.services.reuniones import (
    actualizar_reunion as actualizar_reunion_servicio,
    crear_reunion as crear_reunion_servicio,
    eliminar_reunion as eliminar_reunion_servicio,
    reunion_a_out,
)

router = APIRouter(tags=["Reuniones"])


@router.get("/proyectos/{proyecto_id}/reuniones", response_model=list[ReunionOut])
def listar_reuniones(
    proyecto_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    reuniones = query_reuniones_visibles(db, usuario, proyecto_id).all()
    return [reunion_a_out(r) for r in reuniones]


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
    return reunion_a_out(nueva)


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
    return reunion_a_out(reunion)


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
    return reunion_a_out(reunion)


@router.delete("/reuniones/{reunion_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_reunion(
    reunion_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    eliminar_reunion_servicio(db, usuario, reunion_id)
    db.commit()

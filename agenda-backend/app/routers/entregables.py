"""
Router de entregables: CRUD, actualización de avance con historial,
y consulta de historial. Toda la visibilidad pasa por app.core.permissions.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.permissions import (
    puede_ver_entregable,
    query_entregables_visibles,
    requerir_participacion_en_proyecto,
)
from app.database import get_db
from app.dependencies import obtener_usuario_actual
from app.models.entregable import Entregable
from app.models.historial_avance import HistorialAvance
from app.models.usuario import Usuario
from app.schemas.entregable import (
    ActualizarAvanceRequest,
    EntregableActualizar,
    EntregableCrear,
    EntregableOut,
    HistorialAvanceOut,
)
from app.services.entregables import actualizar_avance as actualizar_avance_servicio
from app.services.entregables import actualizar_entregable as actualizar_entregable_servicio
from app.services.entregables import crear_entregable as crear_entregable_servicio
from app.services.entregables import eliminar_entregable as eliminar_entregable_servicio

router = APIRouter(tags=["Entregables"])


@router.get("/proyectos/{proyecto_id}/entregables", response_model=list[EntregableOut])
def listar_entregables(
    proyecto_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    return query_entregables_visibles(db, usuario, proyecto_id).all()


@router.post(
    "/proyectos/{proyecto_id}/entregables",
    response_model=EntregableOut,
    status_code=status.HTTP_201_CREATED,
)
def crear_entregable(
    proyecto_id: int,
    datos: EntregableCrear,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """
    N1/N2 pueden crear un entregable y asignarlo a cualquiera de su equipo.
    N3/N4 también pueden crear entregables, pero solo para sí mismos
    (autoasignación) — en ese caso se notifica a su supervisor (N2).
    """
    rol = requerir_participacion_en_proyecto(db, usuario, proyecto_id)

    nuevo = crear_entregable_servicio(
        db,
        proyecto_id,
        usuario,
        rol,
        nombre=datos.nombre,
        descripcion=datos.descripcion,
        responsable_id=datos.responsable_id,
        fecha_entrega=datos.fecha_entrega,
        sensible=datos.sensible,
    )
    db.commit()
    db.refresh(nuevo)
    return nuevo


@router.get("/entregables/{entregable_id}", response_model=EntregableOut)
def obtener_entregable(
    entregable_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    entregable = db.query(Entregable).filter(Entregable.id == entregable_id).first()
    if not entregable:
        raise HTTPException(status_code=404, detail="Entregable no encontrado")
    if not puede_ver_entregable(db, usuario, entregable):
        raise HTTPException(status_code=403, detail="No tienes acceso a este entregable")
    return entregable


@router.patch("/entregables/{entregable_id}", response_model=EntregableOut)
def actualizar_entregable(
    entregable_id: int,
    datos: EntregableActualizar,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """Edición general del entregable (nombre, fecha, responsable, etc). Requiere N1/N2."""
    entregable = actualizar_entregable_servicio(
        db, usuario, entregable_id, datos.model_dump(exclude_unset=True)
    )
    db.commit()
    db.refresh(entregable)
    return entregable


@router.delete("/entregables/{entregable_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_entregable(
    entregable_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """Elimina un entregable. Requiere N1/N2."""
    eliminar_entregable_servicio(db, usuario, entregable_id)
    db.commit()


@router.patch("/entregables/{entregable_id}/avance", response_model=EntregableOut)
def actualizar_avance(
    entregable_id: int,
    datos: ActualizarAvanceRequest,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """
    Actualiza el % de avance de un entregable y guarda el registro en el
    historial (para poder comparar "antes vs. ahora"). El propio responsable
    puede hacerlo, además de N1/N2 del proyecto.
    """
    entregable = actualizar_avance_servicio(
        db, usuario, entregable_id, datos.porcentaje_avance
    )
    db.commit()
    db.refresh(entregable)
    return entregable


@router.get(
    "/entregables/{entregable_id}/historial", response_model=list[HistorialAvanceOut]
)
def obtener_historial(
    entregable_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    entregable = db.query(Entregable).filter(Entregable.id == entregable_id).first()
    if not entregable:
        raise HTTPException(status_code=404, detail="Entregable no encontrado")
    if not puede_ver_entregable(db, usuario, entregable):
        raise HTTPException(status_code=403, detail="No tienes acceso a este entregable")

    return (
        db.query(HistorialAvance)
        .filter(HistorialAvance.entregable_id == entregable_id)
        .order_by(HistorialAvance.fecha_registro.asc())
        .all()
    )

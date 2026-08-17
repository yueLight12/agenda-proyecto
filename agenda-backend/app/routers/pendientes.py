"""
Router de pendientes reutilizables: texto reciclable sobre un proyecto/tema,
pensado para "jalarse" en el checklist de una junta recurrente (ver
AgendaItem.pendiente_id). Toda la lógica de permisos vive en
app.services.pendientes -- este router solo valida el schema de entrada y
arma la respuesta.
"""
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import obtener_usuario_actual
from app.models.usuario import Usuario
from app.schemas.pendiente import PendienteCrear, PendienteOut
from app.services.pendientes import (
    crear_pendiente as crear_pendiente_servicio,
    eliminar_pendiente as eliminar_pendiente_servicio,
    listar_pendientes as listar_pendientes_servicio,
    pendiente_a_out,
)

router = APIRouter(prefix="/pendientes", tags=["Pendientes"])


@router.get("", response_model=list[PendienteOut])
def listar_pendientes(
    proyecto_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    pendientes = listar_pendientes_servicio(db, usuario, proyecto_id)
    return [pendiente_a_out(p) for p in pendientes]


@router.post("", response_model=PendienteOut, status_code=status.HTTP_201_CREATED)
def crear_pendiente(
    datos: PendienteCrear,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    pendiente = crear_pendiente_servicio(db, usuario, datos)
    db.commit()
    db.refresh(pendiente)
    return pendiente_a_out(pendiente)


@router.delete("/{pendiente_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_pendiente(
    pendiente_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    eliminar_pendiente_servicio(db, usuario, pendiente_id)
    db.commit()

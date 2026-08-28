"""
Router de pendientes personales: checklist 100% privado de cada usuario.
Toda la lógica vive en app.services.pendientes_personales -- este router
solo valida el schema de entrada y arma la respuesta.
"""
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import obtener_usuario_actual
from app.models.usuario import Usuario
from app.schemas.pendiente_personal import (
    PendientePersonalActualizar,
    PendientePersonalCrear,
    PendientePersonalOut,
)
from app.services.pendientes_personales import (
    actualizar_pendiente_personal,
    crear_pendiente_personal,
    eliminar_pendiente_personal,
    listar_pendientes_personales,
)

router = APIRouter(prefix="/pendientes-personales", tags=["Pendientes personales"])


@router.get("", response_model=list[PendientePersonalOut])
def listar(
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    return listar_pendientes_personales(db, usuario)


@router.post("", response_model=PendientePersonalOut, status_code=status.HTTP_201_CREATED)
def crear(
    datos: PendientePersonalCrear,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    pendiente = crear_pendiente_personal(db, usuario, datos)
    db.commit()
    db.refresh(pendiente)
    return pendiente


@router.patch("/{pendiente_id}", response_model=PendientePersonalOut)
def actualizar(
    pendiente_id: int,
    datos: PendientePersonalActualizar,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    pendiente = actualizar_pendiente_personal(db, usuario, pendiente_id, datos)
    db.commit()
    db.refresh(pendiente)
    return pendiente


@router.delete("/{pendiente_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar(
    pendiente_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    eliminar_pendiente_personal(db, usuario, pendiente_id)
    db.commit()

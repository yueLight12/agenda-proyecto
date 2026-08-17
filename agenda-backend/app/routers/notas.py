"""
Router de notas: avisos/pendientes libres sobre un entregable, una reunión
o una minuta. Toda la lógica de permisos vive en app.services.notas — este
router solo valida el schema de entrada y arma la respuesta.
"""
from typing import Optional

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import obtener_usuario_actual
from app.models.usuario import Usuario
from app.schemas.nota import NotaCrear, NotaOut
from app.services.notas import (
    crear_nota as crear_nota_servicio,
    eliminar_nota as eliminar_nota_servicio,
    listar_notas as listar_notas_servicio,
    nota_a_out,
)

router = APIRouter(prefix="/notas", tags=["Notas"])


@router.get("", response_model=list[NotaOut])
def listar_notas(
    entregable_id: Optional[int] = None,
    reunion_id: Optional[int] = None,
    minuta_id: Optional[int] = None,
    proyecto_id: Optional[int] = None,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    notas = listar_notas_servicio(db, usuario, entregable_id, reunion_id, minuta_id, proyecto_id)
    return [nota_a_out(n) for n in notas]


@router.post("", response_model=NotaOut, status_code=status.HTTP_201_CREATED)
def crear_nota(
    datos: NotaCrear,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    nota = crear_nota_servicio(db, usuario, datos)
    db.commit()
    db.refresh(nota)
    return nota_a_out(nota)


@router.delete("/{nota_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_nota(
    nota_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    eliminar_nota_servicio(db, usuario, nota_id)
    db.commit()

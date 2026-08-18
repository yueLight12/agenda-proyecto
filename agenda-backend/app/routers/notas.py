"""
Router de notas: avisos/pendientes libres sobre un entregable, una reunión
o una minuta. Toda la lógica de permisos vive en app.services.notas — este
router solo valida el schema de entrada y arma la respuesta.
"""
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import obtener_usuario_actual
from app.models.usuario import Usuario
from app.schemas.nota import NotaCrear, NotaOut
from app.services.almacenamiento import ruta_absoluta
from app.services.notas import (
    agregar_imagen_a_nota as agregar_imagen_a_nota_servicio,
    crear_nota as crear_nota_servicio,
    eliminar_nota as eliminar_nota_servicio,
    listar_notas as listar_notas_servicio,
    nota_a_out,
    obtener_nota_visible_o_404,
)

router = APIRouter(prefix="/notas", tags=["Notas"])


@router.get("", response_model=list[NotaOut])
def listar_notas(
    entregable_id: Optional[int] = None,
    reunion_id: Optional[int] = None,
    minuta_id: Optional[int] = None,
    proyecto_id: Optional[int] = None,
    nota_padre_id: Optional[int] = None,
    pendiente_padre_id: Optional[int] = None,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    notas = listar_notas_servicio(
        db, usuario, entregable_id, reunion_id, minuta_id, proyecto_id,
        nota_padre_id, pendiente_padre_id,
    )
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


@router.post("/{nota_id}/imagen", response_model=NotaOut)
async def subir_imagen_nota(
    nota_id: int,
    archivo: UploadFile = File(...),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """Adjunta (o reemplaza) la captura de pantalla de una nota ya creada
    -- se manda por separado de POST /notas porque esa sigue siendo JSON
    puro, sin volverla multipart."""
    nota = await agregar_imagen_a_nota_servicio(db, usuario, nota_id, archivo)
    db.commit()
    db.refresh(nota)
    return nota_a_out(nota)


@router.get("/{nota_id}/imagen")
def obtener_imagen_nota(
    nota_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """Sirve el archivo -- autenticado y con el mismo permiso de ver la
    nota (hereda la visibilidad de su padre), nunca un mount estático
    público."""
    nota = obtener_nota_visible_o_404(db, usuario, nota_id)
    if not nota.imagen_path:
        raise HTTPException(status_code=404, detail="Esta nota no tiene imagen")
    return FileResponse(ruta_absoluta(nota.imagen_path))

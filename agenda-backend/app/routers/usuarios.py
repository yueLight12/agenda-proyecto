"""
Router de gestión de usuarios.

Nota de diseño: dar de alta usuarios y verlos en general requiere ser N1 en
AL MENOS un proyecto, o ser super admin global (`usuario.es_super_admin`,
ver app.core.permissions).
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.database import get_db
from app.dependencies import obtener_usuario_actual
from app.models.usuario import RolEnum, Usuario
from app.models.usuario_proyecto_rol import UsuarioProyectoRol
from app.schemas.usuario import UsuarioActualizar, UsuarioCrear, UsuarioOut

router = APIRouter(prefix="/usuarios", tags=["Usuarios"])


def _es_n1_en_algun_proyecto(db: Session, usuario: Usuario) -> bool:
    return (
        db.query(UsuarioProyectoRol)
        .filter(
            UsuarioProyectoRol.usuario_id == usuario.id,
            UsuarioProyectoRol.rol == RolEnum.N1,
        )
        .first()
        is not None
    )


def _requerir_n1(db: Session, usuario: Usuario):
    if usuario.es_super_admin:
        return
    if not _es_n1_en_algun_proyecto(db, usuario):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo un usuario con rol N1 puede realizar esta acción",
        )


@router.get("", response_model=list[UsuarioOut])
def listar_usuarios(
    db: Session = Depends(get_db), usuario: Usuario = Depends(obtener_usuario_actual)
):
    _requerir_n1(db, usuario)
    return db.query(Usuario).all()


@router.post("", response_model=UsuarioOut, status_code=status.HTTP_201_CREATED)
def crear_usuario(
    datos: UsuarioCrear,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    _requerir_n1(db, usuario)

    if db.query(Usuario).filter(Usuario.email == datos.email).first():
        raise HTTPException(status_code=400, detail="Ese email ya está registrado")

    nuevo = Usuario(
        nombre=datos.nombre,
        puesto=datos.puesto,
        email=datos.email,
        password_hash=hash_password(datos.password),
    )
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)
    return nuevo


@router.patch("/{usuario_id}", response_model=UsuarioOut)
def actualizar_usuario(
    usuario_id: int,
    datos: UsuarioActualizar,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    _requerir_n1(db, usuario)

    objetivo = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not objetivo:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if datos.nombre is not None:
        objetivo.nombre = datos.nombre
    if datos.puesto is not None:
        objetivo.puesto = datos.puesto
    if datos.activo is not None:
        objetivo.activo = datos.activo
    if datos.password is not None:
        objetivo.password_hash = hash_password(datos.password)

    db.commit()
    db.refresh(objetivo)
    return objetivo

"""
Router de autenticación: login y datos del usuario actual.
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.core.security import crear_access_token, hash_password, verificar_password
from app.database import get_db
from app.dependencies import obtener_usuario_actual
from app.models.usuario import Usuario
from app.schemas.usuario import CambiarPasswordRequest, Token, UsuarioConRolesOut
from app.services.usuarios import usuario_con_roles_a_out

router = APIRouter(prefix="/auth", tags=["Autenticación"])


@router.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """
    Login con email (como username) y password.
    Compatible con el flujo estándar OAuth2PasswordBearer de FastAPI.
    """
    usuario = db.query(Usuario).filter(Usuario.email == form_data.username).first()

    if not usuario or not verificar_password(form_data.password, usuario.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email o contraseña incorrectos",
        )
    if not usuario.activo:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Usuario inactivo"
        )

    # ultimo_login (2026-08-21): así el sistema sabe quién nunca ha
    # entrado a la app, para el aviso por correo -- ver
    # app/services/avisos_acceso.py.
    usuario.ultimo_login = datetime.utcnow()
    db.commit()

    token = crear_access_token(data={"sub": str(usuario.id)})
    return Token(access_token=token)


@router.get("/me", response_model=UsuarioConRolesOut)
def obtener_perfil_actual(usuario: Usuario = Depends(obtener_usuario_actual)):
    """Devuelve los datos del usuario autenticado junto con sus roles por proyecto."""
    return usuario_con_roles_a_out(usuario)


@router.post("/cambiar-password", status_code=status.HTTP_204_NO_CONTENT)
def cambiar_password(
    datos: CambiarPasswordRequest,
    usuario: Usuario = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    """Permite al usuario autenticado cambiar su propia contraseña."""
    if not verificar_password(datos.password_actual, usuario.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La contraseña actual no es correcta",
        )
    if len(datos.password_nueva) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La nueva contraseña debe tener al menos 8 caracteres",
        )

    usuario.password_hash = hash_password(datos.password_nueva)
    db.commit()

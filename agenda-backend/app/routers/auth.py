"""
Router de autenticación: login y datos del usuario actual.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.core.security import crear_access_token, hash_password, verificar_password
from app.database import get_db
from app.dependencies import obtener_usuario_actual
from app.models.usuario import Usuario
from app.schemas.usuario import (
    CambiarPasswordRequest,
    RolPorProyectoOut,
    Token,
    UsuarioConRolesOut,
    UsuarioOut,
)

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

    token = crear_access_token(data={"sub": str(usuario.id)})
    return Token(access_token=token)


@router.get("/me", response_model=UsuarioConRolesOut)
def obtener_perfil_actual(usuario: Usuario = Depends(obtener_usuario_actual)):
    """Devuelve los datos del usuario autenticado junto con sus roles por proyecto."""
    roles = [
        RolPorProyectoOut(
            proyecto_id=r.proyecto_id,
            proyecto_nombre=r.proyecto.nombre,
            rol=r.rol,
            supervisor_id=r.supervisor_id,
        )
        for r in usuario.roles_por_proyecto
    ]
    # Se construye desde UsuarioOut (sin roles) porque validar roles_por_proyecto
    # directamente desde el objeto ORM falla: ese campo requiere proyecto_nombre,
    # que no existe como atributo plano en UsuarioProyectoRol (viene de r.proyecto.nombre).
    base = UsuarioOut.model_validate(usuario)
    return UsuarioConRolesOut(**base.model_dump(), roles_por_proyecto=roles)


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

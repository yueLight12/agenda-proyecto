"""
Dependencias comunes de FastAPI: obtener el usuario autenticado a partir del JWT.
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.security import decodificar_access_token
from app.database import get_db
from app.models.usuario import Usuario
from app.services.eventos_tiempo_real import usuario_actor_id

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def obtener_usuario_actual(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> Usuario:
    credenciales_invalidas = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudo validar la credencial",
        headers={"WWW-Authenticate": "Bearer"},
    )

    payload = decodificar_access_token(token)
    if payload is None:
        raise credenciales_invalidas

    usuario_id = payload.get("sub")
    if usuario_id is None:
        raise credenciales_invalidas

    usuario = db.query(Usuario).filter(Usuario.id == int(usuario_id)).first()
    if usuario is None or not usuario.activo:
        raise credenciales_invalidas

    # 2026-09-21, a petición de Yue ("todo tiene que ser en tiempo real"):
    # guarda quién hace la petición actual en un ContextVar -- lo lee el
    # hook de SQLAlchemy en eventos_tiempo_real.py para avisarle a ESTE
    # mismo usuario cuando su propia acción (crear/editar una tarea, una
    # reunión, un recordatorio) cambia algo en la BD, aunque esa acción no
    # genere una Notificacion para él (ej. autoasignarse una tarea -- ahí
    # solo se notifica al supervisor, nunca al propio usuario, así que sin
    # esto su "Mi semana" no se refrescaba sola hasta recargar la página).
    usuario_actor_id.set(usuario.id)

    return usuario

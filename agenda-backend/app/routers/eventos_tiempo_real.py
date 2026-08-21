"""
Router de tiempo real (Server-Sent Events). Ver
app/services/eventos_tiempo_real.py para el diseño completo (pub/sub en
memoria + hook global de SQLAlchemy).

Autenticación por query param, no por header (2026-08-21): el cliente
nativo `EventSource` del navegador NO permite mandar headers personalizados
(no hay forma de poner "Authorization: Bearer ..."), a diferencia de
`fetch`/axios que usa el resto de la app -- por eso este único endpoint
recibe el token como `?token=...` en vez de reusar la dependencia
`obtener_usuario_actual` (que exige el header). El token sigue siendo el
mismo JWT de siempre, solo cambia CÓMO viaja en esta ruta específica.
"""
import asyncio
import json

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session as SASession

from app.core.security import decodificar_access_token
from app.database import SessionLocal
from app.models.usuario import Usuario
from app.services.eventos_tiempo_real import desuscribir, suscribir

router = APIRouter(prefix="/eventos", tags=["Tiempo real"])

# Late para que EventSource (que reconecta solo si la conexión se corta)
# no reciba un stream infinito sin cortes -- cada ~30s se manda un
# comentario SSE de "sigo vivo" para que proxies/túneles intermedios
# (ver el túnel público del proyecto) no cierren la conexión por
# inactividad, sin que cuente como un evento real para el frontend.
INTERVALO_KEEPALIVE_SEGUNDOS = 25


def _usuario_desde_token(token: str) -> Usuario:
    payload = decodificar_access_token(token)
    if payload is None or payload.get("sub") is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")
    db: SASession = SessionLocal()
    try:
        usuario = db.query(Usuario).filter(Usuario.id == int(payload["sub"])).first()
        if usuario is None or not usuario.activo:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")
        db.expunge(usuario)
        return usuario
    finally:
        db.close()


@router.get("/stream")
async def stream(token: str = Query(...)):
    usuario = _usuario_desde_token(token)
    cola = suscribir(usuario.id)

    async def generador():
        try:
            while True:
                try:
                    evento = await asyncio.wait_for(
                        cola.get(), timeout=INTERVALO_KEEPALIVE_SEGUNDOS
                    )
                    yield f"data: {json.dumps(evento)}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            desuscribir(usuario.id, cola)

    return StreamingResponse(
        generador(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )

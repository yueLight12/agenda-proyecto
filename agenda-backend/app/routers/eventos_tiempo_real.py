"""
Router de tiempo real (Server-Sent Events). Ver
app/services/eventos_tiempo_real.py para el diseño completo (pub/sub en
memoria + hook global de SQLAlchemy).

Autenticación por query param, no por header (2026-08-21): el cliente
nativo `EventSource` del navegador NO permite mandar headers personalizados
(no hay forma de poner "Authorization: Bearer ..."), a diferencia de
`fetch`/axios que usa el resto de la app -- por eso este único endpoint no
reusa la dependencia `obtener_usuario_actual` (que exige el header).

Recibe un TICKET de un solo uso (`?ticket=...`), no el JWT completo
(2026-09-19, hallazgo de seguridad: el JWT viajaba tal cual en esta URL y
quedaba en logs de acceso del servidor/devtunnel). El frontend pide el
ticket primero vía POST /auth/ticket (autenticado normal, por header) y
recién con eso abre el EventSource -- ver
app/services/tickets_temporales.py y useEventosTiempoReal.js.
"""
import asyncio
import json

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from starlette.concurrency import run_in_threadpool
from sqlalchemy.orm import Session as SASession

from app.database import SessionLocal
from app.models.usuario import Usuario
from app.services import tickets_temporales
from app.services.eventos_tiempo_real import desuscribir, suscribir

router = APIRouter(prefix="/eventos", tags=["Tiempo real"])

# Late para que EventSource (que reconecta solo si la conexión se corta)
# no reciba un stream infinito sin cortes -- cada ~30s se manda un
# comentario SSE de "sigo vivo" para que proxies/túneles intermedios
# (ver el túnel público del proyecto) no cierren la conexión por
# inactividad, sin que cuente como un evento real para el frontend.
INTERVALO_KEEPALIVE_SEGUNDOS = 25


def _usuario_desde_ticket(ticket: str) -> Usuario:
    usuario_id = tickets_temporales.canjear_ticket(ticket)
    if usuario_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Ticket inválido o expirado")
    db: SASession = SessionLocal()
    try:
        usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
        if usuario is None or not usuario.activo:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Ticket inválido")
        db.expunge(usuario)
        return usuario
    finally:
        db.close()


@router.get("/stream")
async def stream(ticket: str = Query(...)):
    # `_usuario_desde_ticket` abre su propia sesión y hace un SELECT
    # SÍNCRONO (driver de Postgres bloqueante) -- llamarlo directo aquí
    # (esta ruta es `async def`, a diferencia del resto del proyecto que
    # usa rutas `def` normales, que FastAPI ya corre en threadpool solo)
    # bloqueaba el ÚNICO hilo del event loop en cada conexión nueva
    # (2026-09-19, bug real: con varias pantallas abriendo esta conexión a
    # la vez -- ver useEventosTiempoReal.js -- la app entera se sentía
    # lenta). `run_in_threadpool` lo saca del event loop, igual que ya
    # pasa automáticamente con las rutas `def`.
    usuario = await run_in_threadpool(_usuario_desde_ticket, ticket)
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

"""
Tiempo real (2026-08-21, a petición de Yue: "que se refleje de inmediato
si alguien asigna algo o marca algo como completado"). Server-Sent Events
(SSE) en vez de Socket.IO/WebSockets: el flujo real solo necesita empuje
del servidor hacia el cliente (nunca al revés), y SSE logra eso con mucha
menos infraestructura -- una sola conexión HTTP normal, sin librería de
cliente/servidor nueva, sin lidiar con reconexión propia (el navegador ya
reconecta EventSource solo).

Arquitectura: un solo proceso uvicorn (sin --workers, ver Dockerfile), así
que un pub/sub EN MEMORIA (colas asyncio por usuario_id) es suficiente --
no hace falta Redis ni nada externo. Si algún día se corre con más de un
worker/proceso, esto habría que moverlo a un backend compartido (Redis
pub/sub) para que un evento publicado en un worker llegue a un cliente
conectado a otro.

Cómo se disparan los eventos: en vez de tener que acordarse de llamar
"publicar" a mano en cada uno de los ~10 lugares del código que crean una
Notificacion (crear_entregable, reasignar_entregable, actualizar_avance,
generar_recordatorios, crear_nota, crear_reunion, etc.), se engancha un
listener GLOBAL de SQLAlchemy a nivel de Session: cualquier Notificacion
nueva que se comitee, sin importar desde qué función, dispara el evento.
Esto cubre "todo" (el pedido explícito de Yue) sin tener que tocar cada
servicio uno por uno, y sin arriesgarse a que se le olvide agregarlo a un
lugar nuevo en el futuro.
"""
import asyncio
import logging

from sqlalchemy import event
from sqlalchemy.orm import Session

from app.models.notificacion import Notificacion

logger = logging.getLogger(__name__)

_loop: asyncio.AbstractEventLoop | None = None
_colas_por_usuario: dict[int, list[asyncio.Queue]] = {}


def registrar_loop(loop: asyncio.AbstractEventLoop) -> None:
    """Se llama una vez, en el startup de FastAPI (main.py) -- necesitamos
    una referencia al event loop para poder publicar de forma segura desde
    los hooks de SQLAlchemy, que corren en un hilo del threadpool (las
    rutas de este proyecto son `def`, no `async def`), no en el loop."""
    global _loop
    _loop = loop


def suscribir(usuario_id: int) -> asyncio.Queue:
    cola: asyncio.Queue = asyncio.Queue()
    _colas_por_usuario.setdefault(usuario_id, []).append(cola)
    return cola


def desuscribir(usuario_id: int, cola: asyncio.Queue) -> None:
    colas = _colas_por_usuario.get(usuario_id, [])
    if cola in colas:
        colas.remove(cola)
    if not colas:
        _colas_por_usuario.pop(usuario_id, None)


def publicar(usuario_id: int, evento: dict) -> None:
    """Llamable desde código SÍNCRONO (el hook de SQLAlchemy). Se usa
    `call_soon_threadsafe` porque `asyncio.Queue` no es segura para
    llamarse desde un hilo distinto al que corre el event loop -- llamar
    `put_nowait` directo aquí sería una condición de carrera real."""
    if _loop is None:
        return
    for cola in _colas_por_usuario.get(usuario_id, []):
        _loop.call_soon_threadsafe(cola.put_nowait, evento)


def _antes_de_commit(session: Session) -> None:
    """Captura los datos de las Notificacion nuevas ANTES del commit
    (mientras el objeto ORM sigue vivo y con sus atributos accesibles) --
    después del commit, SQLAlchemy expira los atributos por default y
    tocarlos dispararía un SELECT nuevo, además de que ya no hace falta:
    solo se necesita avisar "algo cambió para este usuario", no mandar el
    contenido completo por este canal (el cliente vuelve a pedir la lista
    real, mismo patrón que ya usa `recargarSenal` en el frontend)."""
    nuevas = [
        {"usuario_id": obj.usuario_id, "tipo": obj.tipo.value}
        for obj in session.new
        if isinstance(obj, Notificacion)
    ]
    if nuevas:
        session.info["_eventos_tiempo_real_pendientes"] = nuevas


def _despues_de_commit(session: Session) -> None:
    pendientes = session.info.pop("_eventos_tiempo_real_pendientes", None)
    if not pendientes:
        return
    for item in pendientes:
        try:
            publicar(item["usuario_id"], {"evento": "notificacion_nueva", "tipo": item["tipo"]})
        except Exception:
            logger.exception("No se pudo publicar evento de tiempo real")


def registrar_hooks_sqlalchemy() -> None:
    """Se llama una sola vez, al importar/arrancar la app (ver main.py).
    Aplica a TODAS las sesiones (Session es la clase base que usa
    SessionLocal en app/database.py), no solo a una instancia -- así no
    hace falta enganchar esto por separado en cada request."""
    event.listen(Session, "before_commit", _antes_de_commit)
    event.listen(Session, "after_commit", _despues_de_commit)

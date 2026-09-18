"""
Tickets de un solo uso para no exponer el JWT completo en una URL
(2026-09-19, hallazgo de seguridad: el token viajaba tal cual en el query
string de /eventos/stream y en la redirección de SAML, quedando en logs de
acceso y en el historial del navegador -- ver comentarios en
routers/eventos_tiempo_real.py y routers/saml_sso.py).

Un ticket es un valor opaco de corta vida (segundos) que solo sirve para
canjearse UNA vez por el access_token real; nunca es él mismo un JWT válido,
así que aunque quede en un log o en el historial ya no sirve de nada pasado
ese canje o esos segundos.

Almacenamiento en memoria del proceso (mismo supuesto ya establecido para
`eventos_tiempo_real.py`: una sola instancia del backend, sin múltiples
workers) -- no requiere tabla ni migración para algo que vive segundos.
"""
import secrets
import time

TICKET_TTL_SEGUNDOS = 60

_tickets: dict[str, tuple[int, float]] = {}


def crear_ticket(usuario_id: int) -> str:
    """Genera un ticket de un solo uso para este usuario, válido por
    TICKET_TTL_SEGUNDOS."""
    _purgar_expirados()
    ticket = secrets.token_urlsafe(32)
    _tickets[ticket] = (usuario_id, time.monotonic() + TICKET_TTL_SEGUNDOS)
    return ticket


def canjear_ticket(ticket: str) -> int | None:
    """Consume el ticket (de un solo uso) y devuelve el usuario_id asociado,
    o None si no existe, ya se usó, o expiró."""
    dato = _tickets.pop(ticket, None)
    if dato is None:
        return None
    usuario_id, expira_en = dato
    if time.monotonic() > expira_en:
        return None
    return usuario_id


def _purgar_expirados() -> None:
    ahora = time.monotonic()
    vencidos = [t for t, (_, expira_en) in _tickets.items() if ahora > expira_en]
    for t in vencidos:
        _tickets.pop(t, None)

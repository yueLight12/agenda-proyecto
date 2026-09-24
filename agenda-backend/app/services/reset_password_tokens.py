"""
Tokens de un solo uso para "recuperar contraseña" (2026-09-23, a petición
de Yue: algo rápido, sin mucho trabajo). Mismo patrón exacto que
app/services/tickets_temporales.py (en memoria, sin tabla ni migración) --
solo cambia el TTL, mucho más largo porque aquí el usuario tiene que abrir
su correo y volver, no es una redirección inmediata dentro de la misma
sesión de navegador.
"""
import secrets
import time

TOKEN_TTL_SEGUNDOS = 30 * 60  # 30 minutos

_tokens: dict[str, tuple[int, float]] = {}


def crear_token(usuario_id: int) -> str:
    _purgar_expirados()
    token = secrets.token_urlsafe(32)
    _tokens[token] = (usuario_id, time.monotonic() + TOKEN_TTL_SEGUNDOS)
    return token


def canjear_token(token: str) -> int | None:
    """Consume el token (de un solo uso) y devuelve el usuario_id asociado,
    o None si no existe, ya se usó, o expiró."""
    dato = _tokens.pop(token, None)
    if dato is None:
        return None
    usuario_id, expira_en = dato
    if time.monotonic() > expira_en:
        return None
    return usuario_id


def _purgar_expirados() -> None:
    ahora = time.monotonic()
    vencidos = [t for t, (_, expira_en) in _tokens.items() if ahora > expira_en]
    for t in vencidos:
        _tokens.pop(t, None)

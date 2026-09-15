"""
Rate limiting (2026-09-15, a petición de Yue) -- para el piloto con 20-30
personas usando el sistema expuesto públicamente (devtunnel/VPS), sin nada
que frenara antes intentos repetidos de adivinar una contraseña contra
/auth/login. Instancia única de Limiter compartida entre app/main.py
(registro del middleware/handler) y los routers que la usan (evita import
circular: main.py importa los routers, así que el límite no puede vivir
ahí).
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

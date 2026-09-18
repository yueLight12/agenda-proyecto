"""
Esquemas del panel de administración (superadmin) -- 2026-09-07.
"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.models.usuario import RolEnum


class ReasignarTodoRequest(BaseModel):
    origen_id: int
    destino_id: int


class ReasignarTodoOut(BaseModel):
    origen: str
    destino: str
    movimientos: dict[str, int]


class ConfiguracionActualizar(BaseModel):
    clave: str
    valor: str


class RegistroAuditoriaOut(BaseModel):
    id: int
    fecha: datetime
    actor_id: int
    actor_nombre: str
    accion: str
    objetivo_id: Optional[int] = None
    objetivo_nombre: Optional[str] = None
    detalle: Optional[dict] = None


class ActividadItemOut(BaseModel):
    """Un evento en la línea de tiempo de 'Actividad reciente' (opción A,
    2026-09-17) -- a diferencia de RegistroAuditoriaOut (solo acciones de
    superadmin), esto junta lo que YA guardan varias tablas del uso normal
    de la app (login, tareas, avances, reuniones, notas) en una sola
    lista, sin agregar ningún registro nuevo. Ver app/services/actividad.py."""

    fecha: datetime
    usuario_id: Optional[int] = None
    usuario_nombre: str
    tipo: str
    descripcion: str


class OrganigramaUsuarioOut(BaseModel):
    id: int
    nombre: str
    activo: bool


class OrganigramaRelacionOut(BaseModel):
    jefe_id: int
    jefe_nombre: str
    usuario_id: int
    usuario_nombre: str
    rol: RolEnum


class OrganigramaOut(BaseModel):
    """Árbol jefe-subordinado (2026-09-17, a petición de Yue) -- las
    relaciones son las mismas de 'Mi equipo' (equipo_miembros), aquí
    expuestas para que el superadmin las vea y reorganice sin depender de
    que cada jefe entre a su propia pantalla. `usuarios` trae a TODOS
    (activos e inactivos) para poder elegir a quién agregar/mover."""

    relaciones: list[OrganigramaRelacionOut]
    usuarios: list[OrganigramaUsuarioOut]


class OrganigramaAsignarRequest(BaseModel):
    jefe_id: int
    usuario_id: int
    rol: RolEnum


class VerComoOut(BaseModel):
    """"Ver como" (2026-09-17) -- ver app/services/admin.py::generar_token_ver_como."""

    access_token: str
    token_type: str = "bearer"
    usuario_nombre: str


class IntentoFallidoOut(BaseModel):
    """'Opción B' (2026-09-17) -- ver app/models/intento_fallido.py."""

    id: int
    fecha: datetime
    usuario_id: Optional[int] = None
    usuario_nombre: Optional[str] = None
    correo_intentado: Optional[str] = None
    metodo: str
    ruta: str
    status_code: int
    detalle: Optional[str] = None

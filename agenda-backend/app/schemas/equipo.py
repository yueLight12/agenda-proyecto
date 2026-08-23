"""
Esquemas Pydantic para "mi equipo" (plantilla personal reutilizable).
"""
from typing import Optional

from pydantic import BaseModel

from app.models.usuario import RolEnum


class EquipoMiembroCrear(BaseModel):
    usuario_id: int
    rol: RolEnum


class PersonaNuevaCrear(BaseModel):
    nombre: str
    puesto: Optional[str] = None
    email: str
    rol: RolEnum


class ProyectoDeMiembroSimpleOut(BaseModel):
    """Versión liviana de ProyectoDeMiembroOut (ver
    app/schemas/equipo_resumen.py) -- solo lo que necesita el selector de
    tema de ModalAsignarTareaRapida.jsx (2026-08-22, bug real: ese selector
    filtraba `persona.proyectos`, campo que EquipoMiembroOut nunca traía,
    así que el selector de tema quedaba SIEMPRE vacío)."""

    proyecto_id: int
    proyecto_nombre: str
    viewer_puede_administrar: bool = False

    class Config:
        from_attributes = True


class EquipoMiembroOut(BaseModel):
    usuario_id: int
    nombre: str
    puesto: Optional[str] = None
    email: str
    rol: RolEnum
    # True = fila real en tu plantilla guardada (se puede quitar). False =
    # reporte real tuyo (supervisor_id en algún tema) que se muestra aquí
    # de solo lectura porque todavía no lo guardaste a mano -- ver
    # app/services/equipos.py::listar_mi_equipo_efectivo. Default True
    # para no romper los demás usos de este schema (agregar/aplicar
    # plantilla), que siempre son filas guardadas de verdad.
    guardado: bool = True
    # Temas donde esta persona participa y QUIEN VE la pantalla puede
    # administrar (2026-08-22) -- default [] para no afectar los otros usos
    # de este schema (POST /mi-equipo, aplicar-mi-equipo), que solo lo
    # llenan en GET /mi-equipo (ver listar_mi_equipo_efectivo).
    proyectos: list[ProyectoDeMiembroSimpleOut] = []

    class Config:
        from_attributes = True

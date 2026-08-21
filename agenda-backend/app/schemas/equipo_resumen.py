"""
Esquemas Pydantic: resumen de equipo multi-proyecto (ver
app/services/equipo_resumen.py). Se construyen a mano en el servicio, no
directo desde el ORM, así que no usan `from_attributes`.
"""
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel

from app.models.entregable import EstatusEntregable
from app.models.usuario import RolEnum


class EntregableResumenPersonaOut(BaseModel):
    id: int
    nombre: str
    fecha_entrega: date
    porcentaje_avance: int
    estatus: EstatusEntregable
    sensible: bool
    # Nombre del responsable (2026-08-19, a petición de Yue: mostrar el
    # encargado junto a cada tema/subtema/entregable) -- necesario porque
    # proyectosAgregados() en el frontend fusiona entregables de varias
    # personas en una sola columna "por proyecto", perdiendo de otro modo a
    # quién pertenece cada uno.
    responsable_nombre: str
    # Nombre de quien lo asignó (2026-08-19, a petición de Yue: "David te
    # asignó [nombre], vence en N días" en el resumen de la caja propia) --
    # Entregable.creado_por ya existía, solo se expone el nombre aquí.
    creado_por_nombre: str
    # Urgencia combinada (2026-08-20, a petición del cliente) -- mismo
    # cálculo que EntregableOut.urgente, ver
    # app/services/entregables.py::es_urgente.
    urgente: bool = False


class ReunionResumenPersonaOut(BaseModel):
    id: int
    titulo: str
    fecha_inicio: datetime
    rol_en_reunion: str  # "organiza" | "invitado" — solo para la UI, no cambia la regla de visibilidad


class ProyectoDeMiembroOut(BaseModel):
    proyecto_id: int
    proyecto_nombre: str
    rol: RolEnum
    supervisor_id: Optional[int] = None
    entregables: list[EntregableResumenPersonaOut] = []
    reuniones: list[ReunionResumenPersonaOut] = []
    # Calculado en servidor (2026-08-16, generalización a árbol de temas):
    # si QUIEN VE la pantalla puede administrar este proyecto/tema (N1/N2,
    # local o heredado) -- reemplaza el cálculo que hacía el frontend
    # cruzando usuario.roles_por_proyecto, que se rompe con herencia.
    viewer_puede_administrar: bool = False
    # parent_id del nodo (2026-08-17): para que el frontend pueda marcar
    # "(subtema)" y distinguirlo de un tema raíz en "Tu equipo"/"Equipo" --
    # ver KanbanSupervisores.jsx. None si es un tema raíz.
    parent_id: Optional[int] = None
    # Orden de importancia GLOBAL entre hermanos (2026-08-18, a petición de
    # Yue: "ordenar los temas del más importante al menos importante") --
    # ver Proyecto.orden. El frontend ordena el árbol por este campo antes
    # de dibujarlo, en vez del orden de llegada del backend.
    orden: int = 0


class MiembroResumenOut(BaseModel):
    usuario_id: int
    nombre: str
    puesto: Optional[str] = None
    email: str
    proyectos: list[ProyectoDeMiembroOut] = []


class ResumenEquipoOut(BaseModel):
    miembros: list[MiembroResumenOut] = []

"""
Esquemas Pydantic: Entregable e Historial de Avance.
"""
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.models.entregable import EstatusEntregable


class EntregableBase(BaseModel):
    nombre: str
    descripcion: Optional[str] = None
    responsable_id: int
    fecha_entrega: date
    sensible: bool = False
    # Urgencia marcada a mano por quien asigna (2026-08-20, a petición del
    # cliente) -- ver Entregable.urgente_manual. Se combina con la
    # urgencia automática por fecha, nunca se usa sola en el frontend.
    urgente_manual: bool = False


class EntregableCrear(EntregableBase):
    pass


class EntregableActualizar(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    responsable_id: Optional[int] = None
    fecha_entrega: Optional[date] = None
    sensible: Optional[bool] = None
    estatus: Optional[EstatusEntregable] = None
    urgente_manual: Optional[bool] = None


class ReasignarEntregableRequest(BaseModel):
    # Reasignar un entregable a otra persona del equipo, o a cualquier
    # líder (N1/N2) de otro tema (2026-08-20, a petición del cliente: "si
    # alguien te asignó algo que no te pertenece, poder reasignarlo... a
    # otro líder de otra área") -- ver
    # app/core/permissions.py::puede_reasignar_entregable y
    # app/services/entregables.py::reasignar_entregable.
    nuevo_responsable_id: int
    # Nota opcional visible en el hilo del entregable (2026-08-20, a
    # petición del cliente: poder decir "esto no me compete" al reasignar
    # de vuelta) -- reusa el sistema de Notas ya existente, sin tabla nueva.
    nota: Optional[str] = None


class ActualizarAvanceRequest(BaseModel):
    porcentaje_avance: int = Field(ge=0, le=100)


class MoverEntregableRequest(BaseModel):
    direccion: str  # "arriba" | "abajo"


class HistorialAvanceOut(BaseModel):
    id: int
    porcentaje_avance: int
    actualizado_por: int
    fecha_registro: datetime

    class Config:
        from_attributes = True


class EntregableOut(EntregableBase):
    id: int
    proyecto_id: int
    porcentaje_avance: int
    estatus: EstatusEntregable
    creado_por: int
    fecha_creacion: datetime
    orden: int
    # Calculado en servidor (2026-08-16, generalización a árbol de temas) --
    # el frontend nunca debe recalcular permiso cruzando
    # usuario.roles_por_proyecto, que se rompe con herencia. Ver
    # app/services/entregables.py::entregable_a_out.
    puede_editar: bool = False
    # Urgencia COMBINADA (manual OR vencido OR vence en ≤3 días) --
    # 2026-08-20, a petición del cliente: el frontend nunca debe recalcular
    # esto, siempre usa este campo. Ver
    # app/services/entregables.py::es_urgente.
    urgente: bool = False
    # Si quien ve la pantalla puede reasignar este entregable a otra
    # persona (N1/N2 del proyecto, o el propio responsable actual --
    # 2026-08-20, a petición del cliente: "si te asignaron algo que no te
    # pertenece, poder reasignarlo"). Ver
    # app/core/permissions.py::puede_reasignar_entregable.
    puede_reasignar: bool = False

    class Config:
        from_attributes = True

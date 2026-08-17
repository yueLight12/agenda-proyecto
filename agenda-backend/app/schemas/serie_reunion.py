"""
Esquemas Pydantic: series de reuniones recurrentes + agenda persistente
(ver app/models/serie_reunion.py, app/models/agenda_item.py). Se arman a
mano en el servicio (igual que equipo_resumen.py), no directo desde el
ORM, para poder resolver nombres (proyecto/entregable/acuerdo) y el estado
derivado de un AgendaItem sin exponer las tablas crudas.
"""
from datetime import date, datetime, time
from typing import Optional

from pydantic import BaseModel

from app.models.agenda_item import EstadoRevision, TipoAgendaItem


class ParticipanteSerieOut(BaseModel):
    usuario_id: int
    nombre: str


class SerieReunionCrear(BaseModel):
    proyecto_id: Optional[int] = None
    titulo: str
    dia_semana: int  # 0=lunes ... 6=domingo
    hora: time
    duracion_minutos: int = 30
    participantes_ids: list[int] = []
    fecha_inicio: date
    fecha_fin: Optional[date] = None


class SerieReunionActualizar(BaseModel):
    titulo: Optional[str] = None
    dia_semana: Optional[int] = None
    hora: Optional[time] = None
    duracion_minutos: Optional[int] = None
    participantes_ids: Optional[list[int]] = None
    fecha_fin: Optional[date] = None
    activa: Optional[bool] = None


class SerieReunionOut(BaseModel):
    id: int
    proyecto_id: Optional[int] = None
    proyecto_nombre: Optional[str] = None
    titulo: str
    organizador_id: int
    organizador_nombre: str
    dia_semana: int
    hora: time
    duracion_minutos: int
    fecha_inicio: date
    fecha_fin: Optional[date] = None
    activa: bool
    participantes: list[ParticipanteSerieOut] = []
    # Calculado en servidor, mismo criterio que puede_editar_reunion.
    puede_editar: bool = False


class AgendaItemCrear(BaseModel):
    tipo: TipoAgendaItem
    proyecto_id: Optional[int] = None
    entregable_id: Optional[int] = None
    acuerdo_id: Optional[int] = None
    # Nota ya existente sobre un tema (tipo=nota). Alternativa a
    # nota_contenido: si se manda, se crea una Nota nueva sobre
    # seccion_proyecto_id y se referencia -- ver agregar_item_agenda.
    nota_id: Optional[int] = None
    nota_contenido: Optional[str] = None
    # Pendiente ya existente sobre un tema (tipo=pendiente). Alternativa a
    # pendiente_contenido: si se manda, se crea un Pendiente nuevo sobre
    # seccion_proyecto_id y se referencia -- ver agregar_item_agenda.
    pendiente_id: Optional[int] = None
    pendiente_contenido: Optional[str] = None
    texto: Optional[str] = None
    detalle: Optional[str] = None
    # Bajo qué tema/subtema se agrupa este punto -- ver
    # AgendaItem.seccion_proyecto_id. Irrelevante para tipo=tema (el ítem
    # ES la sección, se ignora si se manda).
    seccion_proyecto_id: Optional[int] = None


class AgendaItemActualizar(BaseModel):
    texto: Optional[str] = None
    detalle: Optional[str] = None
    seccion_proyecto_id: Optional[int] = None


class MoverItemAgendaRequest(BaseModel):
    direccion: str  # "arriba" | "abajo"


class AgendaItemOut(BaseModel):
    id: int
    serie_id: Optional[int] = None
    reunion_id: Optional[int] = None
    tipo: TipoAgendaItem
    nombre: str  # resuelto: proyecto.nombre / entregable.nombre / acuerdo.descripcion / nota / texto
    detalle: Optional[str] = None
    seccion_proyecto_id: Optional[int] = None
    seccion_nombre: Optional[str] = None  # None = "General" (sin sección)
    activo: bool
    orden: int
    # Estado derivado de la AgendaItemRevision más reciente (o "pendiente"
    # si nunca se ha revisado) -- ver agenda_actual_de_serie.
    estado_actual: EstadoRevision
    ultima_nota: Optional[str] = None
    ultima_fecha_revision: Optional[datetime] = None
    ultima_reunion_id: Optional[int] = None


class RevisionAgendaItemRequest(BaseModel):
    estado: EstadoRevision
    nota: Optional[str] = None
    # Si se manda, además de registrar la revisión se crea un AgendaItem
    # nuevo (tipo=pendiente) enganchado a la misma serie -- lo que surgió
    # en la plática queda listo para la siguiente ocurrencia.
    nuevo_pendiente_texto: Optional[str] = None


class RevisionAgendaItemOut(BaseModel):
    id: int
    agenda_item_id: int
    estado: EstadoRevision
    nota: Optional[str] = None
    fecha_registro: datetime
    nuevo_item: Optional[AgendaItemOut] = None

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
from app.models.serie_reunion import TipoRecurrencia


class ParticipanteSerieOut(BaseModel):
    usuario_id: int
    nombre: str


class SerieReunionCrear(BaseModel):
    proyecto_id: Optional[int] = None
    titulo: str
    notas: Optional[str] = None
    tipo_recurrencia: TipoRecurrencia = TipoRecurrencia.semanal
    dia_semana: Optional[int] = None  # requerido si tipo_recurrencia=semanal (0=lunes...6=domingo)
    dia_mes: Optional[int] = None  # requerido si tipo_recurrencia=mensual (1-31)
    hora: time
    duracion_minutos: int = 30
    participantes_ids: list[int] = []
    fecha_inicio: date
    fecha_fin: Optional[date] = None


class SerieReunionActualizar(BaseModel):
    titulo: Optional[str] = None
    notas: Optional[str] = None
    # tipo_recurrencia NO es editable (no se puede cambiar de semanal a
    # mensual, ej. -- archivar y crear una serie nueva); dia_semana/dia_mes
    # sí, para poder mover "cada lunes" a "cada martes" sin recrear todo.
    dia_semana: Optional[int] = None
    dia_mes: Optional[int] = None
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
    notas: Optional[str] = None
    organizador_id: int
    organizador_nombre: str
    tipo_recurrencia: TipoRecurrencia
    dia_semana: Optional[int] = None
    dia_mes: Optional[int] = None
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


class ActualizarTemasRequest(BaseModel):
    # Reemplaza (no solo agrega) el conjunto de temas cubiertos por esta
    # junta -- ver app.services.series_reunion.actualizar_temas.
    proyecto_ids: list[int] = []


class AgendaItemOut(BaseModel):
    id: int
    serie_id: Optional[int] = None
    reunion_id: Optional[int] = None
    tipo: TipoAgendaItem
    nombre: str  # resuelto: proyecto.nombre / entregable.nombre / acuerdo.descripcion / nota / texto
    detalle: Optional[str] = None
    seccion_proyecto_id: Optional[int] = None
    seccion_nombre: Optional[str] = None  # None = "General" (sin sección)
    # parent_id de la sección (2026-08-17, checklist como árbol en Vista
    # Equipo) -- para que el frontend agrupe secciones como subtema/tema en
    # vez de una lista plana. None si la sección es un tema raíz o si no
    # hay sección (General).
    seccion_parent_id: Optional[int] = None
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


class PendienteRevisionOut(BaseModel):
    """Un tema con un ítem de agenda todavía activo en alguna junta donde
    el usuario puede marcarlo revisado -- ver
    app.services.minutas.listar_pendientes_revision."""

    proyecto_id: int
    proyecto_nombre: str
    item_id: int
    reunion_id: int


class TemaResueltoOut(BaseModel):
    """Un tema ya resuelto (nada pendiente de revisar en ninguna junta,
    habiendo tenido algo antes), con el `item_id` del ítem de agenda
    archivado que lo dejó así -- 2026-08-18, a petición de Yue: poder
    "marcar pendiente" explícitamente desde Vista Equipo, sin ir a la
    pestaña Historial. `item_id` es lo que necesita
    seriesReunionApi.revertirRevisado (mismo endpoint que ya usa el botón
    "Revertir" del Historial). Ver
    app.services.minutas.listar_temas_resueltos."""

    proyecto_id: int
    proyecto_nombre: str
    item_id: int


class EventoHistorialOut(BaseModel):
    """Una fila del historial semanal -- ver
    app.services.historial_minutas.historial_semana."""

    tema_nombre: str
    junta_titulo: str
    reunion_id: int
    usuario_nombre: Optional[str] = None  # quién lo marcó/registró (None para "nuevo")
    estado: Optional[EstadoRevision] = None  # None para "nuevo" (no es una revisión)
    nota: Optional[str] = None
    fecha: datetime
    # Ítem tipo=tema al que corresponde esta fila -- solo presente en
    # "revisados" (2026-08-18, botón "Revertir": ver
    # app.services.series_reunion.revertir_revision_tema). None en "nuevos"/
    # "pendientes", que no se revierten desde esta vista.
    agenda_item_id: Optional[int] = None
    # proyecto_id del tema (2026-08-19, vista de tabla alternativa en
    # Seguimiento: "mostrar todo como en la minuta actual, con los temas
    # que se vieron") -- None cuando el ítem no es tipo=tema (ej. un
    # accionable suelto de la agenda), que esa vista de tabla ignora por
    # completo (solo aplica a temas/proyectos reales).
    proyecto_id: Optional[int] = None


class HistorialSemanaOut(BaseModel):
    numero_semana: int
    fecha_inicio: date
    fecha_fin: date
    revisados: list[EventoHistorialOut] = []
    nuevos: list[EventoHistorialOut] = []
    pendientes: list[EventoHistorialOut] = []

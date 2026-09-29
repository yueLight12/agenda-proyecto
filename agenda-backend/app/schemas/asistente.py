"""Esquemas Pydantic del asistente de voz."""
from typing import Literal, Optional

from pydantic import BaseModel


class TranscribirResponse(BaseModel):
    texto: str


class SintetizarVozRequest(BaseModel):
    """Fase 4 del plan de fluidez de Chambeador (2026-09-28) -- texto que el
    asistente va a "decir" + qué voz Piper usar (ver
    app/services/voz_neural.py::VOCES_DISPONIBLES)."""
    texto: str
    voz: Literal["es_MX-claude-high"]


class AccionPendienteOut(BaseModel):
    tool: str
    parametros_llm: dict


class TurnoHistorialIn(BaseModel):
    """Un turno ya cerrado de la MISMA sesión del modal (2026-09-25, memoria
    de conversación de corto plazo, Fase 2 del plan de fluidez de
    Chambeador) -- el frontend lo arma con lo que ya mostró en pantalla, NO
    se persiste en ningún lado del backend, solo vive mientras el modal
    sigue abierto. Ver interprete.py::_construir_historial."""
    usuario: str
    asistente: str


class OpcionAclaracionOut(BaseModel):
    valor: int | str
    etiqueta: str


class InterpretarRequest(BaseModel):
    texto: str
    proyecto_id_contexto: Optional[int] = None
    tool: Optional[str] = None
    parametros_llm: Optional[dict] = None
    aclaraciones: dict = {}
    # Cola de acciones restantes de una instrucción compuesta que ya venía
    # resolviéndose (ver InterpretarResponse.acciones_pendientes) — vacía si
    # es una instrucción nueva.
    acciones_pendientes: list[AccionPendienteOut] = []
    # Últimos turnos de esta misma conversación (memoria de corto plazo,
    # 2026-09-25) -- se manda tanto en instrucciones nuevas (`tool` vacío)
    # como en respuestas a una aclaración con `texto` libre (2026-09-29,
    # rediseño conversacional -- ver interprete.py::interpretar_seguimiento).
    # El frontend acota cuántos manda; el backend no le pone límite propio.
    historial: list[TurnoHistorialIn] = []
    # Campo/pregunta/opciones de la aclaración que se está respondiendo
    # (2026-09-29, rediseño conversacional) -- el frontend los recuerda de
    # la última InterpretarResponse tipo "aclaracion". Solo se usan cuando
    # `tool` y `texto` vienen los dos con valor: en ese caso, en vez de
    # meter `texto` a la fuerza como el valor literal del campo (bug real:
    # una corrección como "no, quiero un pendiente personal" se atoraba
    # ahí sin sentido), se le pregunta al LLM qué está pasando -- ver
    # interpretar_seguimiento. Si `campo_pendiente` viene vacío (ej. el
    # usuario eligió una opción con un clic, sin ambigüedad posible), se
    # usa el camino directo de siempre, sin llamar al LLM otra vez.
    campo_pendiente: Optional[str] = None
    pregunta_pendiente: Optional[str] = None
    opciones_pendientes: list[OpcionAclaracionOut] = []


class InterpretarResponse(BaseModel):
    tipo: Literal["propuesta", "aclaracion", "error", "respuesta"]
    tool: Optional[str] = None
    parametros: Optional[dict] = None
    resumen: Optional[str] = None
    campo: Optional[str] = None
    pregunta: Optional[str] = None
    tipo_entrada: Optional[Literal["opciones", "fecha", "texto"]] = None
    opciones: list[OpcionAclaracionOut] = []
    parametros_llm: Optional[dict] = None
    mensaje: Optional[str] = None
    # Datos estructurados para pintar una vista previa fiel (tarjeta de
    # entregable/proyecto/reunión/etc.) en vez de solo el texto de `resumen`
    # — ver ResultadoInterpretacion.preview en tools.py.
    preview: Optional[dict] = None
    # Resto de acciones de la misma instrucción compuesta, todavía sin
    # resolver (ver app/routers/asistente.py) — el cliente las va mandando de
    # vuelta una a la vez conforme confirma cada paso.
    acciones_pendientes: list[AccionPendienteOut] = []


class ConfirmarRequest(BaseModel):
    tool: str
    parametros: dict


class ConfirmarResponse(BaseModel):
    ok: bool
    mensaje: str
    resultado: Optional[dict] = None


class CancelarRequest(BaseModel):
    tool: str
    parametros: dict

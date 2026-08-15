"""Esquemas Pydantic del asistente de voz."""
from typing import Literal, Optional

from pydantic import BaseModel


class TranscribirResponse(BaseModel):
    texto: str


class AccionPendienteOut(BaseModel):
    tool: str
    parametros_llm: dict


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


class OpcionAclaracionOut(BaseModel):
    valor: int | str
    etiqueta: str


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

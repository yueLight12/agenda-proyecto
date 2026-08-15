"""Esquemas Pydantic del asistente de voz."""
from typing import Literal, Optional

from pydantic import BaseModel


class TranscribirResponse(BaseModel):
    texto: str


class InterpretarRequest(BaseModel):
    texto: str
    proyecto_id_contexto: Optional[int] = None
    tool: Optional[str] = None
    parametros_llm: Optional[dict] = None
    aclaraciones: dict = {}


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

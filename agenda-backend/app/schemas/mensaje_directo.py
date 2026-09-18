"""
Esquemas Pydantic: mensajes directos persona-a-persona (ver
app/models/mensaje_directo.py).
"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class MensajeDirectoCrear(BaseModel):
    contenido: str


class MensajeDirectoOut(BaseModel):
    id: int
    autor_id: int
    autor_nombre: str
    destinatario_id: int
    destinatario_nombre: str
    contenido: str
    fecha_creacion: datetime
    fecha_leido: Optional[datetime] = None

    class Config:
        from_attributes = True


class ConversacionResumenOut(BaseModel):
    """Una fila del "inbox" -- la otra persona + el último mensaje +
    cuántos sin leer te mandó ella (nunca cuenta los que TÚ mandaste)."""

    usuario_id: int
    nombre: str
    puesto: Optional[str] = None
    ultimo_mensaje: str
    fecha_ultimo_mensaje: datetime
    no_leidos: int

"""
Esquemas Pydantic: bandeja de salida de correo para Power Automate
Desktop -- ver app/models/correo_pendiente.py.
"""
from datetime import datetime

from pydantic import BaseModel


class CorreoPendienteOut(BaseModel):
    id: int
    destinatario_email: str
    asunto: str
    cuerpo_texto: str
    fecha_creacion: datetime

    class Config:
        from_attributes = True

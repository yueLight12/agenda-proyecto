"""
Esquemas Pydantic: EventoEmpresa (ver app/models/evento_empresa.py).
"""
from datetime import date

from pydantic import BaseModel

from app.models.evento_empresa import TipoEventoEmpresa


class EventoEmpresaOut(BaseModel):
    id: int
    nombre: str
    tipo: TipoEventoEmpresa
    fecha: date  # próxima ocurrencia (calculada para cumpleaños/festivo)
    fecha_original: date  # tal como se cargó, sin recalcular

    class Config:
        from_attributes = True

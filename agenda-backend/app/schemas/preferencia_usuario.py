"""
Esquemas Pydantic: preferencias de apariencia por usuario.
"""
from typing import Literal, Optional

from pydantic import BaseModel, field_validator

TIPOS_TARJETA_VALIDOS = {"tarea", "proyecto", "persona", "agenda", "rendimiento"}


class PreferenciaUsuarioOut(BaseModel):
    shape: Literal["square", "rounded", "circle"]
    theme: Literal["claro", "oscuro"]
    card_order: Optional[list[str]] = None

    class Config:
        from_attributes = True


class PreferenciaUsuarioActualizar(BaseModel):
    shape: Optional[Literal["square", "rounded", "circle"]] = None
    theme: Optional[Literal["claro", "oscuro"]] = None
    card_order: Optional[list[str]] = None

    @field_validator("card_order")
    @classmethod
    def _validar_card_order(cls, valor):
        if valor is None:
            return valor
        if set(valor) != TIPOS_TARJETA_VALIDOS or len(valor) != len(TIPOS_TARJETA_VALIDOS):
            raise ValueError(
                f"card_order debe contener exactamente estos tipos, sin repetir: {sorted(TIPOS_TARJETA_VALIDOS)}"
            )
        return valor

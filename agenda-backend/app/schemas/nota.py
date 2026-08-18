"""
Esquemas Pydantic: Nota (aviso/pendiente sobre un entregable, reunión,
minuta o proyecto/tema — ver app/models/nota.py).
"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, model_validator


class NotaCrear(BaseModel):
    contenido: str
    entregable_id: Optional[int] = None
    reunion_id: Optional[int] = None
    minuta_id: Optional[int] = None
    proyecto_id: Optional[int] = None
    # Comentario anidado sobre un Aviso (Nota) o un Pendiente ya existente
    # -- ver app/models/nota.py. Un solo nivel: nota_padre_id siempre
    # apunta a una Nota raíz (con proyecto_id), nunca a otro comentario.
    nota_padre_id: Optional[int] = None
    pendiente_padre_id: Optional[int] = None

    @model_validator(mode="after")
    def _exactamente_un_padre(self):
        padres = [
            self.entregable_id,
            self.reunion_id,
            self.minuta_id,
            self.proyecto_id,
            self.nota_padre_id,
            self.pendiente_padre_id,
        ]
        if sum(1 for p in padres if p is not None) != 1:
            raise ValueError(
                "La nota debe ligarse exactamente a uno de: entregable_id, reunion_id, "
                "minuta_id, proyecto_id, nota_padre_id o pendiente_padre_id"
            )
        return self


class NotaOut(BaseModel):
    id: int
    entregable_id: Optional[int] = None
    reunion_id: Optional[int] = None
    minuta_id: Optional[int] = None
    proyecto_id: Optional[int] = None
    nota_padre_id: Optional[int] = None
    pendiente_padre_id: Optional[int] = None
    contenido: str
    autor_id: int
    autor_nombre: str
    fecha_creacion: datetime
    # No expone la ruta cruda -- solo si hay o no imagen. La imagen en sí
    # se pide vía GET /notas/{id}/imagen (autenticado, mismo permiso que
    # ver la nota), nunca por una URL pública directa.
    tiene_imagen: bool = False

    class Config:
        from_attributes = True

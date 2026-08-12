"""
Router de eventos de empresa: cumpleaños/festivos/eventos, de solo
lectura. A diferencia del resto del sistema, este dato NO es por
proyecto — deliberadamente no pasa por app.core.permissions (no hay
ningún alcance de proyecto que filtrar), no es un descuido de la regla de
oro del proyecto. Solo requiere sesión válida.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import obtener_usuario_actual
from app.models.usuario import Usuario
from app.schemas.evento_empresa import EventoEmpresaOut
from app.services.eventos_empresa import listar_eventos_empresa

router = APIRouter(prefix="/eventos-empresa", tags=["Eventos de empresa"])


@router.get("", response_model=list[EventoEmpresaOut])
def listar(
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    return listar_eventos_empresa(db)

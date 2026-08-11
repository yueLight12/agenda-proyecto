"""
Router del chatbot de consulta (solo lectura, respeta permisos por proyecto).
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import obtener_usuario_actual
from app.models.usuario import Usuario
from app.schemas.chatbot import PreguntaChatbotIn, RespuestaChatbotOut
from app.services.chatbot import responder_pregunta

router = APIRouter(prefix="/chatbot", tags=["Chatbot"])


@router.post("/consulta", response_model=RespuestaChatbotOut)
def consultar_chatbot(
    datos: PreguntaChatbotIn,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """Responde una pregunta en lenguaje natural usando solo datos visibles para el usuario."""
    try:
        respuesta = responder_pregunta(db, usuario, datos.pregunta)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc
    return RespuestaChatbotOut(respuesta=respuesta)

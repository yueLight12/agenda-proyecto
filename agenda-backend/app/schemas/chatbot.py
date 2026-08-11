"""
Esquemas del chatbot de consulta.
"""
from pydantic import BaseModel


class PreguntaChatbotIn(BaseModel):
    pregunta: str


class RespuestaChatbotOut(BaseModel):
    respuesta: str

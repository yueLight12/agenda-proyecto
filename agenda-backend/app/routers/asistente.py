"""
Router del asistente de voz: transcribe audio, interpreta la instrucción
(texto → tool + parámetros resueltos contra la base de datos real) y, tras
confirmación explícita del usuario, ejecuta la acción llamando a la MISMA
función de servicio que usa la API REST — mismas reglas de permisos N1-N4,
mismos 403/404/400 de siempre.

Diseño stateless: /interpretar devuelve la propuesta (tool + parámetros ya
resueltos) directamente al cliente; /confirmar recibe ese mismo tool +
parámetros de vuelta y re-valida permisos al ejecutar (igual que si se
llamara a la API REST a mano) — no hace falta guardar una "propuesta
pendiente" en el servidor entre medio.
"""
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import obtener_usuario_actual
from app.models.usuario import Usuario
from app.schemas.asistente import (
    CancelarRequest,
    ConfirmarRequest,
    ConfirmarResponse,
    InterpretarRequest,
    InterpretarResponse,
    OpcionAclaracionOut,
    TranscribirResponse,
)
from app.services.asistente.interprete import SIN_ACCION, interpretar_instruccion
from app.services.asistente.tools import TOOLS
from app.services.asistente.whisper_client import transcribir as transcribir_audio

router = APIRouter(prefix="/asistente", tags=["Asistente de voz"])


@router.post("/transcribir", response_model=TranscribirResponse)
async def transcribir(
    audio: UploadFile = File(...),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    contenido = await audio.read()
    texto = transcribir_audio(contenido, audio.filename or "audio.webm", audio.content_type or "audio/webm")
    return TranscribirResponse(texto=texto)


@router.post("/interpretar", response_model=InterpretarResponse)
def interpretar(
    datos: InterpretarRequest,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    if datos.tool:
        # Segunda vuelta (o más) tras una aclaración: no se vuelve a llamar
        # al LLM, solo se reintenta resolver con la aclaración incorporada.
        tool_nombre = datos.tool
        parametros_llm = datos.parametros_llm or {}
    else:
        interpretado = interpretar_instruccion(db, usuario, datos.texto)
        tool_nombre = interpretado["tool"]
        parametros_llm = interpretado["parametros"]

    if tool_nombre == SIN_ACCION or tool_nombre not in TOOLS:
        return InterpretarResponse(
            tipo="error",
            mensaje="No entendí bien esa instrucción, ¿puedes repetirla de otra forma?",
        )

    spec = TOOLS[tool_nombre]
    try:
        resultado = spec.resolver(db, usuario, datos.proyecto_id_contexto, parametros_llm, datos.aclaraciones)
    except HTTPException as exc:
        return InterpretarResponse(tipo="error", mensaje=str(exc.detail))

    if not resultado.listo:
        return InterpretarResponse(
            tipo="aclaracion",
            tool=tool_nombre,
            parametros_llm=parametros_llm,
            campo=resultado.campo,
            pregunta=resultado.pregunta,
            tipo_entrada=resultado.tipo_entrada,
            opciones=[OpcionAclaracionOut(valor=o.valor, etiqueta=o.etiqueta) for o in resultado.opciones],
        )

    if not spec.requiere_confirmacion:
        # Tools de solo lectura (ej. consultar_agenda): ya se resolvió/ejecutó
        # dentro del resolver, no hay nada que confirmar.
        return InterpretarResponse(tipo="respuesta", tool=tool_nombre, mensaje=resultado.resumen)

    return InterpretarResponse(
        tipo="propuesta",
        tool=tool_nombre,
        parametros=resultado.parametros,
        resumen=resultado.resumen,
    )


@router.post("/confirmar", response_model=ConfirmarResponse)
def confirmar(
    datos: ConfirmarRequest,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    if datos.tool not in TOOLS:
        raise HTTPException(status_code=400, detail="Herramienta desconocida")

    resultado = TOOLS[datos.tool].ejecutar(db, usuario, datos.parametros)
    return ConfirmarResponse(ok=True, mensaje=resultado["mensaje"], resultado=resultado.get("resultado"))


@router.post("/cancelar", status_code=status.HTTP_204_NO_CONTENT)
def cancelar(
    datos: CancelarRequest,
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    # No ejecuta nada — el frontend simplemente descarta la propuesta. Se
    # deja como endpoint real (en vez de manejarlo 100% en el cliente) para
    # poder agregar auditoría más adelante sin cambiar el contrato del API.
    return None

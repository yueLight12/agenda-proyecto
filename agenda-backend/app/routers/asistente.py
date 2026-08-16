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
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import obtener_usuario_actual
from app.models.proyecto import Proyecto
from app.models.usuario import Usuario
from app.schemas.asistente import (
    AccionPendienteOut,
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


_VOCABULARIO_DOMINIO = (
    "agenda, entregable, entregables, proyecto, proyectos, reunión, minuta, "
    "acuerdo, colaborador, colaboradora, líder, dirección, avance"
)


def _prompt_nombres_conocidos(db: Session) -> str:
    """Arma el `initial_prompt` que se le pasa a Whisper con los nombres
    reales de todos los usuarios y proyectos del sistema, más un puñado de
    palabras propias del dominio de la app, para que la transcripción
    reconozca nombres cortos o poco comunes (ej. "Jasso") y no confunda
    palabras parecidas del vocabulario típico (ej. "agenda" transcrito como
    "agente"). Se usan todos los usuarios y proyectos, no solo los visibles
    para quien graba, porque el asistente necesita poder agregar a alguien
    que todavía no participa en ningún proyecto compartido con quien habla
    (ver agregar_miembro en tools.py) — esto nunca sale de este proceso
    local, solo se manda al contenedor de Whisper que corre en la misma Pi.

    Nota: esto solo reduce el error de transcripción de palabras que YA
    existen (nombres, proyectos existentes). Para un proyecto/entregable
    nuevo que se está creando, el texto transcrito se vuelve el nombre
    guardado tal cual — no hay nada contra qué comparar todavía, así que la
    vista previa de confirmación sigue siendo la última línea de defensa."""
    nombres = [u.nombre for u in db.query(Usuario).all()]
    proyectos = [p.nombre for p in db.query(Proyecto).all()]
    partes = [f"Vocabulario de la aplicación: {_VOCABULARIO_DOMINIO}."]
    if nombres:
        partes.append("Nombres de personas mencionadas: " + ", ".join(nombres) + ".")
    if proyectos:
        partes.append("Nombres de proyectos mencionados: " + ", ".join(proyectos) + ".")
    return " ".join(partes)


@router.post("/transcribir", response_model=TranscribirResponse)
async def transcribir(
    audio: UploadFile = File(...),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    contenido = await audio.read()
    texto = transcribir_audio(
        contenido,
        audio.filename or "audio.webm",
        audio.content_type or "audio/webm",
        initial_prompt=_prompt_nombres_conocidos(db),
    )
    return TranscribirResponse(texto=texto)


def _resolver_y_responder(
    db: Session,
    usuario: Usuario,
    proyecto_id_contexto: Optional[int],
    tool_nombre: str,
    parametros_llm: dict,
    aclaraciones: dict,
    acciones_pendientes: list[AccionPendienteOut],
) -> InterpretarResponse:
    """Resuelve UNA acción (tool + parametros_llm) y arma la respuesta,
    cargando siempre la cola de acciones que todavía faltan de la misma
    instrucción compuesta (ver InterpretarResponse.acciones_pendientes)."""
    if tool_nombre == SIN_ACCION or tool_nombre not in TOOLS:
        return InterpretarResponse(
            tipo="error",
            mensaje="No entendí bien esa instrucción, ¿puedes repetirla de otra forma?",
        )

    spec = TOOLS[tool_nombre]
    try:
        resultado = spec.resolver(db, usuario, proyecto_id_contexto, parametros_llm, aclaraciones)
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
            acciones_pendientes=acciones_pendientes,
        )

    if not spec.requiere_confirmacion:
        # Tools de solo lectura (ej. consultar_agenda): ya se resolvió/ejecutó
        # dentro del resolver, no hay nada que confirmar.
        return InterpretarResponse(
            tipo="respuesta", tool=tool_nombre, mensaje=resultado.resumen, acciones_pendientes=acciones_pendientes
        )

    return InterpretarResponse(
        tipo="propuesta",
        tool=tool_nombre,
        parametros=resultado.parametros,
        resumen=resultado.resumen,
        preview=resultado.preview,
        acciones_pendientes=acciones_pendientes,
    )


@router.post("/interpretar", response_model=InterpretarResponse)
def interpretar(
    datos: InterpretarRequest,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    if datos.tool:
        # Retomar tras una aclaración, o continuar con la siguiente acción de
        # una instrucción compuesta: no se vuelve a llamar al LLM.
        return _resolver_y_responder(
            db, usuario, datos.proyecto_id_contexto,
            datos.tool, datos.parametros_llm or {}, datos.aclaraciones, datos.acciones_pendientes,
        )

    interpretado = interpretar_instruccion(db, usuario, datos.texto)
    acciones = interpretado["acciones"]
    primera = acciones[0]
    resto = [
        AccionPendienteOut(tool=a["tool"], parametros_llm=a["parametros"])
        for a in acciones[1:]
    ]
    return _resolver_y_responder(
        db, usuario, datos.proyecto_id_contexto,
        primera["tool"], primera["parametros"], datos.aclaraciones, resto,
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

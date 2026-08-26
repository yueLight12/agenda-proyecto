"""
Cliente HTTP para el servicio de transcripción de voz (Whisper), que corre
DENTRO de Docker (a diferencia de Ollama, que corre en la máquina host) —
ver docker-compose.yml, servicio `whisper`.
"""
import logging
import time

import requests

from app.core.config import settings

logger = logging.getLogger("asistente.whisper")
logger.setLevel(logging.INFO)
# Sin esto, un logger.info() no aparece en los logs del contenedor: el
# proyecto no configura logging.basicConfig en ningún lado (uvicorn solo
# le pone handler a SUS propios loggers, no al root) -- sin un handler
# propio aquí, Python usa el "handler de último recurso", que filtra en
# WARNING y para abajo se pierde. Temporal mientras dure esta medición de
# velocidad del contenedor whisper.
if not logger.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    logger.addHandler(_handler)


def transcribir(audio_bytes: bytes, nombre_archivo: str, content_type: str, initial_prompt: str = "") -> str:
    """`initial_prompt` es el mecanismo propio de Whisper para sesgar la
    transcripción hacia palabras/nombres esperados (ver docs de
    onerahmet/openai-whisper-asr-webservice) — sin esto, nombres cortos o
    poco comunes (ej. "Jasso") a veces se transcriben como una alucinación
    de nombre completo no relacionado en vez del nombre real dicho."""
    # vad_filter (2026-08-26, optimización de velocidad): confirmado contra
    # el /openapi.json real del webservice que SÍ existe como parámetro de
    # request (a diferencia de beam_size, que esta versión de la imagen no
    # expone) -- recorta tramos sin voz antes de correr el modelo, así un
    # comando corto con silencio al inicio/final no paga el costo de
    # inferencia sobre esas partes.
    params = {"task": "transcribe", "language": "es", "output": "txt", "vad_filter": "true"}
    if initial_prompt:
        params["initial_prompt"] = initial_prompt
    # Medición de latencia (2026-08-26, optimización de velocidad del
    # contenedor whisper) -- separa tamaño de audio y duración de la
    # llamada para poder correlacionar tiempos lentos con audios más largos
    # o con un reinicio reciente del proceso interno de uvicorn (ver
    # docker logs agenda-proyecto-whisper-1) en vez de asumir que la config
    # (quantización/beam_size/vad) es la única causa.
    inicio = time.monotonic()
    try:
        respuesta = requests.post(
            f"{settings.whisper_url}/asr",
            params=params,
            files={"audio_file": (nombre_archivo, audio_bytes, content_type)},
            timeout=60,
        )
        respuesta.raise_for_status()
    except requests.RequestException as exc:
        duracion = time.monotonic() - inicio
        logger.warning(
            "transcripcion FALLIDA en %.2fs (audio=%d bytes): %s", duracion, len(audio_bytes), exc
        )
        raise RuntimeError(
            "No se pudo contactar al servicio de transcripción de voz (Whisper)."
        ) from exc
    duracion = time.monotonic() - inicio
    logger.info("transcripcion OK en %.2fs (audio=%d bytes)", duracion, len(audio_bytes))
    return respuesta.text.strip()

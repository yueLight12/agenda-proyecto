"""
Cliente HTTP para el servicio de transcripción de voz (Whisper), que corre
DENTRO de Docker (a diferencia de Ollama, que corre en la máquina host) —
ver docker-compose.yml, servicio `whisper`.
"""
import requests

from app.core.config import settings


def transcribir(audio_bytes: bytes, nombre_archivo: str, content_type: str, initial_prompt: str = "") -> str:
    """`initial_prompt` es el mecanismo propio de Whisper para sesgar la
    transcripción hacia palabras/nombres esperados (ver docs de
    onerahmet/openai-whisper-asr-webservice) — sin esto, nombres cortos o
    poco comunes (ej. "Jasso") a veces se transcriben como una alucinación
    de nombre completo no relacionado en vez del nombre real dicho."""
    params = {"task": "transcribe", "language": "es", "output": "txt"}
    if initial_prompt:
        params["initial_prompt"] = initial_prompt
    try:
        respuesta = requests.post(
            f"{settings.whisper_url}/asr",
            params=params,
            files={"audio_file": (nombre_archivo, audio_bytes, content_type)},
            timeout=60,
        )
        respuesta.raise_for_status()
    except requests.RequestException as exc:
        raise RuntimeError(
            "No se pudo contactar al servicio de transcripción de voz (Whisper)."
        ) from exc
    return respuesta.text.strip()

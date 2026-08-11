"""
Cliente HTTP para el servicio de transcripción de voz (Whisper), que corre
DENTRO de Docker (a diferencia de Ollama, que corre en la máquina host) —
ver docker-compose.yml, servicio `whisper`.
"""
import requests

from app.core.config import settings


def transcribir(audio_bytes: bytes, nombre_archivo: str, content_type: str) -> str:
    try:
        respuesta = requests.post(
            f"{settings.whisper_url}/asr",
            params={"task": "transcribe", "language": "es", "output": "txt"},
            files={"audio_file": (nombre_archivo, audio_bytes, content_type)},
            timeout=60,
        )
        respuesta.raise_for_status()
    except requests.RequestException as exc:
        raise RuntimeError(
            "No se pudo contactar al servicio de transcripción de voz (Whisper)."
        ) from exc
    return respuesta.text.strip()

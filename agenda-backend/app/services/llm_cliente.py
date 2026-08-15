"""
Cliente compartido para llamar al LLM configurado (Ollama local o Gemini en
la nube) — usado tanto por el intérprete de comandos del asistente de voz
(app/services/asistente/interprete.py, salida JSON) como por el chatbot de
consulta (app/services/chatbot.py, salida en prosa).

Motor configurable vía settings.asistente_llm_proveedor: "ollama" (default,
100% local) o "gemini" (sale a internet — ver app/services/llm_privacidad.py
para la seudonimización que se aplica antes de mandar cualquier dato real).
"""
import requests

from app.core.config import settings


def _llamar_ollama(prompt: str, *, json_forzado: bool) -> str:
    body = {"model": settings.ollama_modelo, "prompt": prompt, "stream": False}
    if json_forzado:
        body["format"] = "json"
        body["options"] = {"temperature": 0.1, "num_predict": 300}
    try:
        respuesta = requests.post(f"{settings.ollama_url}/api/generate", json=body, timeout=120)
        respuesta.raise_for_status()
    except requests.RequestException as exc:
        raise RuntimeError(
            "No se pudo contactar al modelo de lenguaje local (Ollama). "
            "Verifica que esté corriendo en la máquina host."
        ) from exc
    return respuesta.json()["response"]


def _llamar_gemini(prompt: str, *, json_forzado: bool) -> str:
    generation_config = {"temperature": 0.1}
    if json_forzado:
        generation_config["responseMimeType"] = "application/json"
    try:
        respuesta = requests.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{settings.gemini_modelo}:generateContent",
            params={"key": settings.gemini_api_key},
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": generation_config,
            },
            timeout=90,
        )
        respuesta.raise_for_status()
    except requests.RequestException as exc:
        raise RuntimeError(
            "No se pudo contactar a la API de Gemini. Verifica GEMINI_API_KEY en .env."
        ) from exc
    return respuesta.json()["candidates"][0]["content"]["parts"][0]["text"]


def generar_texto(prompt: str, *, json_forzado: bool = False) -> str:
    """Manda `prompt` al proveedor configurado y devuelve el texto de la
    respuesta. `json_forzado=True` le pide al modelo que devuelva únicamente
    JSON (usado por el intérprete de comandos; el chatbot no lo necesita,
    quiere prosa)."""
    if settings.asistente_llm_proveedor == "gemini":
        return _llamar_gemini(prompt, json_forzado=json_forzado)
    return _llamar_ollama(prompt, json_forzado=json_forzado)

"""
Cliente compartido para llamar al LLM configurado (Ollama local, Gemini o
Claude en la nube) — usado tanto por el intérprete de comandos del asistente
de voz (app/services/asistente/interprete.py, salida JSON) como por el
chatbot de consulta (app/services/chatbot.py, salida en prosa).

Motor configurable vía settings.asistente_llm_proveedor: "ollama" (default,
100% local), "gemini" o "claude" (ambos salen a internet — ver
app/services/llm_privacidad.py para la seudonimización que se aplica antes
de mandar cualquier dato real).
"""
import anthropic
import requests

from app.core.config import settings

_cliente_claude: anthropic.Anthropic | None = None


def _cliente_anthropic() -> anthropic.Anthropic:
    global _cliente_claude
    if _cliente_claude is None:
        _cliente_claude = anthropic.Anthropic(api_key=settings.claude_api_key)
    return _cliente_claude


def _llamar_ollama(prompt: str, *, json_forzado: bool, sistema: str | None) -> str:
    # Ollama no distingue "system" cacheable de "user" -- se concatena igual
    # que antes de separar el catálogo de herramientas del texto dinámico.
    if sistema:
        prompt = f"{sistema}\n\n{prompt}"
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


def _llamar_gemini(prompt: str, *, json_forzado: bool, sistema: str | None) -> str:
    # La API de Gemini también soporta "system_instruction" con cacheo
    # implícito de contexto, pero no lo implementamos aquí -- por ahora se
    # concatena, igual que Ollama; el proveedor configurado en producción es
    # "claude" (ver CLAUDE.md), así que ahí es donde vale la pena el cacheo.
    if sistema:
        prompt = f"{sistema}\n\n{prompt}"
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


def _llamar_claude(prompt: str, *, json_forzado: bool, sistema: str | None) -> str:
    # json_forzado no usa output_config.format aquí (requeriría declarar un
    # schema JSON explícito) — el prompt ya le pide el JSON exacto que
    # interprete.py espera, igual que con Ollama/Gemini; effort "low" porque
    # es una llamada interactiva (comando de voz o pregunta del chatbot) que
    # no necesita razonamiento profundo.
    #
    # Prompt caching (2026-09-02, a petición de Yue: mejorar tiempos de
    # respuesta) -- cuando `sistema` viene separado (ver
    # interprete.py::_construir_sistema), es el catálogo de 36 herramientas +
    # ejemplos, IDÉNTICO en cada llamada del intérprete; solo cambia el
    # último mensaje ("TEXTO DEL USUARIO"). Con cache_control, Anthropic
    # reutiliza el procesamiento de ese bloque entre llamadas en vez de
    # reprocesarlo cada vez -- baja latencia y costo. El breakpoint dura
    # ~5 min de inactividad; con uso normal del asistente el catálogo se
    # mantiene caliente.
    try:
        kwargs = {}
        if sistema:
            kwargs["system"] = [
                {"type": "text", "text": sistema, "cache_control": {"type": "ephemeral"}}
            ]
        # "effort" no lo soportan todos los modelos (2026-09-02: Haiku 4.5
        # devuelve 400 "This model does not support the effort parameter")
        # -- solo se manda con Opus/Sonnet, donde sí aplica.
        if "haiku" not in settings.claude_modelo:
            kwargs["output_config"] = {"effort": "low"}
        respuesta = _cliente_anthropic().messages.create(
            model=settings.claude_modelo,
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}],
            **kwargs,
        )
    except anthropic.APIError as exc:
        raise RuntimeError(
            "No se pudo contactar a la API de Claude. Verifica CLAUDE_API_KEY en .env."
        ) from exc
    if respuesta.stop_reason == "refusal":
        raise RuntimeError("Claude rechazó la solicitud (revisa stop_details).")
    texto = next((bloque.text for bloque in respuesta.content if bloque.type == "text"), None)
    if texto is None:
        raise RuntimeError("Claude no devolvió texto en la respuesta.")
    return texto


def generar_texto(prompt: str, *, json_forzado: bool = False, sistema: str | None = None) -> str:
    """Manda `prompt` al proveedor configurado y devuelve el texto de la
    respuesta. `json_forzado=True` le pide al modelo que devuelva únicamente
    JSON (usado por el intérprete de comandos; el chatbot no lo necesita,
    quiere prosa).

    `sistema` (opcional): bloque de contexto ESTÁTICO -- igual en llamadas
    sucesivas -- separado del texto dinámico en `prompt`. Con Claude
    aprovecha prompt caching (ver _llamar_claude); con Ollama/Gemini
    simplemente se concatena antes del prompt, sin cambiar el resultado."""
    if settings.asistente_llm_proveedor == "gemini":
        return _llamar_gemini(prompt, json_forzado=json_forzado, sistema=sistema)
    if settings.asistente_llm_proveedor == "claude":
        return _llamar_claude(prompt, json_forzado=json_forzado, sistema=sistema)
    return _llamar_ollama(prompt, json_forzado=json_forzado, sistema=sistema)

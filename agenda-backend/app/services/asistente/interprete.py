"""
Interpreta instrucciones en texto libre y decide qué "tool" del asistente de
voz aplica, usando el LLM local (Ollama) con salida JSON forzada.

El LLM NUNCA produce IDs ni decide permisos — solo extrae texto libre
(nombres, fechas, números) que después se resuelve contra la base de datos
real en cada tool (ver resolucion.py). Si el modelo devuelve un nombre de
tool que no existe en el catálogo, o el JSON sale inválido incluso tras un
reintento, se trata como "no_entendido" — nunca se ejecuta nada a ciegas.
"""
import json

import requests

from app.core.config import settings
from app.services.asistente.tools import TOOLS

SIN_ACCION = "no_entendido"


def _construir_prompt(texto: str) -> str:
    bloques = []
    for spec in TOOLS.values():
        parametros = "; ".join(f"{campo} ({desc})" for campo, desc in spec.parametros_llm.items())
        bloques.append(f"- {spec.nombre}: {spec.descripcion}\n  parametros: {parametros}")
    catalogo = "\n".join(bloques)

    ejemplos = []
    for spec in TOOLS.values():
        for texto_ejemplo, params_ejemplo in spec.ejemplos:
            respuesta_ejemplo = json.dumps(
                {"tool": spec.nombre, "parametros": params_ejemplo}, ensure_ascii=False
            )
            ejemplos.append(f'Texto: "{texto_ejemplo}"\nRespuesta: {respuesta_ejemplo}')
    ejemplos.append(
        'Texto: "¿qué clima hace hoy?"\nRespuesta: {"tool": "no_entendido", "parametros": {}}'
    )
    ejemplos_txt = "\n\n".join(ejemplos)

    return f"""Eres el intérprete de comandos de voz de "Agenda Inteligente de Proyectos".
Tu única tarea es identificar QUÉ ACCIÓN quiere el usuario y EXTRAER los datos
que dijo, en español. NUNCA inventes IDs ni nombres que no estén en el texto.
Si el texto no corresponde claramente a ninguna acción de la lista, responde
con la herramienta "no_entendido".

HERRAMIENTAS DISPONIBLES (responde con el "nombre" exacto de una de estas):

{catalogo}

- no_entendido: usa esta si el texto no pide ninguna de las acciones de arriba.
  parametros: {{}}

FORMATO DE RESPUESTA: responde ÚNICAMENTE un objeto JSON, sin texto antes ni
después, con esta forma exacta:
{{"tool": "<nombre_de_la_herramienta>", "parametros": {{...}}}}

EJEMPLOS:
{ejemplos_txt}

TEXTO DEL USUARIO: "{texto}"
RESPUESTA:"""


def _llamar_ollama(prompt: str) -> str:
    try:
        respuesta = requests.post(
            f"{settings.ollama_url}/api/generate",
            json={
                "model": settings.ollama_modelo,
                "prompt": prompt,
                "stream": False,
                "format": "json",
                "options": {"temperature": 0.1, "num_predict": 300},
            },
            timeout=60,
        )
        respuesta.raise_for_status()
    except requests.RequestException as exc:
        raise RuntimeError(
            "No se pudo contactar al modelo de lenguaje local (Ollama). "
            "Verifica que esté corriendo en la máquina host."
        ) from exc
    return respuesta.json()["response"]


def _parsear_json(texto: str):
    try:
        return json.loads(texto)
    except (json.JSONDecodeError, TypeError):
        return None


def interpretar_instruccion(texto: str) -> dict:
    """Devuelve {"tool": str, "parametros": dict}. tool == "no_entendido" si
    no aplica ninguna acción, o si el modelo no devolvió JSON válido ni
    siquiera tras un reintento."""
    prompt = _construir_prompt(texto)

    datos = _parsear_json(_llamar_ollama(prompt))
    if datos is None:
        datos = _parsear_json(
            _llamar_ollama(prompt + "\n\nResponde SOLO el JSON, una sola línea, nada más.")
        )

    if not isinstance(datos, dict):
        return {"tool": SIN_ACCION, "parametros": {}}

    tool = datos.get("tool")
    if tool not in TOOLS and tool != SIN_ACCION:
        return {"tool": SIN_ACCION, "parametros": {}}

    parametros = datos.get("parametros")
    return {"tool": tool, "parametros": parametros if isinstance(parametros, dict) else {}}

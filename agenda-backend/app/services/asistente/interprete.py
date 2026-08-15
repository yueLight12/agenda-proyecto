"""
Interpreta instrucciones en texto libre y decide qué "tool" del asistente de
voz aplica, con salida JSON forzada. Motor configurable vía
settings.asistente_llm_proveedor: "ollama" (default, 100% local) o "gemini"
(sale a internet — el texto se seudonimiza antes de mandarlo, ver
app/services/llm_privacidad.py, y se restauran los nombres reales en lo que
el modelo devuelve).

El LLM NUNCA produce IDs ni decide permisos — solo extrae texto libre
(nombres, fechas, números) que después se resuelve contra la base de datos
real en cada tool (ver resolucion.py). Si el modelo devuelve un nombre de
tool que no existe en el catálogo, o el JSON sale inválido incluso tras un
reintento, se trata como "no_entendido" — nunca se ejecuta nada a ciegas.
"""
import json

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.usuario import Usuario
from app.services.asistente.tools import TOOLS
from app.services.llm_cliente import generar_texto
from app.services.llm_privacidad import construir_mapa

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


def _parsear_json(texto: str):
    try:
        return json.loads(texto)
    except (json.JSONDecodeError, TypeError):
        return None


def interpretar_instruccion(db: Session, usuario: Usuario, texto: str) -> dict:
    """Devuelve {"tool": str, "parametros": dict}. tool == "no_entendido" si
    no aplica ninguna acción, o si el modelo no devolvió JSON válido ni
    siquiera tras un reintento."""
    mapa = None
    if settings.asistente_llm_proveedor == "gemini":
        mapa = construir_mapa(db, usuario)
        texto = mapa.redactar(texto)

    prompt = _construir_prompt(texto)

    datos = _parsear_json(generar_texto(prompt, json_forzado=True))
    if datos is None:
        datos = _parsear_json(
            generar_texto(prompt + "\n\nResponde SOLO el JSON, una sola línea, nada más.", json_forzado=True)
        )

    if not isinstance(datos, dict):
        return {"tool": SIN_ACCION, "parametros": {}}

    tool = datos.get("tool")
    if tool not in TOOLS and tool != SIN_ACCION:
        return {"tool": SIN_ACCION, "parametros": {}}

    parametros = datos.get("parametros")
    parametros = parametros if isinstance(parametros, dict) else {}
    if mapa is not None:
        parametros = mapa.restaurar(parametros)
    return {"tool": tool, "parametros": parametros}

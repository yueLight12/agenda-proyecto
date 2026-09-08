"""
Interpreta instrucciones en texto libre y decide qué "tool(s)" del asistente
de voz aplican, con salida JSON forzada. Motor configurable vía
settings.asistente_llm_proveedor: "ollama" (default, 100% local), "gemini" o
"claude" (ambos salen a internet — el texto se seudonimiza antes de
mandarlo, ver app/services/llm_privacidad.py, y se restauran los nombres
reales en lo que el modelo devuelve).

El LLM NUNCA produce IDs ni decide permisos — solo extrae texto libre
(nombres, fechas, números) que después se resuelve contra la base de datos
real en cada tool (ver resolucion.py). Si el modelo devuelve un nombre de
tool que no existe en el catálogo, o el JSON sale inválido incluso tras un
reintento, se trata como "no_entendido" — nunca se ejecuta nada a ciegas.

Una instrucción puede pedir VARIAS acciones a la vez (ej. "crea el proyecto
X y pon a Jasso de líder"). El modelo devuelve una LISTA de acciones en
orden; quien llama a interpretar_instruccion (app/routers/asistente.py) es
responsable de resolver/confirmar/ejecutar cada una por separado, una a la
vez, antes de pasar a la siguiente — así cada acción compuesta sigue
pasando por confirmación explícita igual que si fuera la única.
"""
import json

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.usuario import Usuario
from app.services.asistente.tools import TOOLS
from app.services.llm_cliente import generar_texto
from app.services.llm_privacidad import construir_mapa

SIN_ACCION = "no_entendido"


def _construir_sistema() -> str:
    """Bloque ESTÁTICO -- catálogo de herramientas + ejemplos + instrucciones,
    idéntico en cada llamada (solo cambia si tools.py cambia). Separado de
    `texto` a propósito para que llm_cliente.py lo mande como bloque
    cacheado con Claude (ver generar_texto/_llamar_claude) en vez de
    reprocesarlo de cero en cada comando."""
    bloques = []
    for spec in TOOLS.values():
        parametros = "; ".join(f"{campo} ({desc})" for campo, desc in spec.parametros_llm.items())
        bloques.append(f"- {spec.nombre}: {spec.descripcion}\n  parametros: {parametros}")
    catalogo = "\n".join(bloques)

    ejemplos = []
    for spec in TOOLS.values():
        for texto_ejemplo, params_ejemplo in spec.ejemplos:
            respuesta_ejemplo = json.dumps(
                {"acciones": [{"tool": spec.nombre, "parametros": params_ejemplo}]}, ensure_ascii=False
            )
            ejemplos.append(f'Texto: "{texto_ejemplo}"\nRespuesta: {respuesta_ejemplo}')
    ejemplos.append(
        'Texto: "¿qué clima hace hoy?"\nRespuesta: {"acciones": [{"tool": "no_entendido", "parametros": {}}]}'
    )
    ejemplos.append(
        'Texto: "crea un proyecto llamado Escuelas y pon a Jasso como líder"\n'
        'Respuesta: {"acciones": ['
        '{"tool": "crear_proyecto", "parametros": {"nombre": "Escuelas", "descripcion": null}}, '
        '{"tool": "agregar_miembro", "parametros": {"persona": "Jasso", "rol": "líder", "supervisor": "", "proyecto": ""}}'
        ']}'
    )
    ejemplos.append(
        'Texto: "crea el proyecto Cubo, que David sea el líder y Juan quede como colaborador"\n'
        'Respuesta: {"acciones": ['
        '{"tool": "crear_proyecto", "parametros": {"nombre": "Cubo", "descripcion": null}}, '
        '{"tool": "agregar_miembro", "parametros": {"persona": "David", "rol": "líder", "supervisor": "", "proyecto": ""}}, '
        '{"tool": "agregar_miembro", "parametros": {"persona": "Juan", "rol": "colaborador interno", "supervisor": "", "proyecto": ""}}'
        ']}'
    )
    ejemplos_txt = "\n\n".join(ejemplos)

    return f"""Eres el intérprete de comandos de voz de "Agenda Inteligente de Proyectos".
Tu única tarea es identificar QUÉ ACCIÓN o ACCIONES quiere el usuario y
EXTRAER los datos que dijo, en español. NUNCA inventes IDs ni nombres que no
estén en el texto. Un mismo texto puede pedir VARIAS acciones seguidas
(ej. "crea el proyecto X y pon a Fulano de líder") — en ese caso devuelve
una acción por cada una, EN EL ORDEN en que deben ejecutarse (ej. primero
crear el proyecto, después agregar a la gente). Si el texto no corresponde
claramente a ninguna acción de la lista, responde con la herramienta
"no_entendido".

HERRAMIENTAS DISPONIBLES (responde con el "nombre" exacto de una de estas):

{catalogo}

- no_entendido: usa esta si el texto no pide ninguna de las acciones de arriba.
  parametros: {{}}

FORMATO DE RESPUESTA: responde ÚNICAMENTE un objeto JSON, sin texto antes ni
después, con esta forma exacta:
{{"acciones": [{{"tool": "<nombre_de_la_herramienta>", "parametros": {{...}}}}, ...]}}

Si solo hay una acción, la lista trae un solo elemento.

EJEMPLOS:
{ejemplos_txt}"""


def _construir_mensaje_usuario(texto: str) -> str:
    return f'TEXTO DEL USUARIO: "{texto}"\nRESPUESTA:'


def _parsear_json(texto: str):
    try:
        return json.loads(texto)
    except (json.JSONDecodeError, TypeError):
        pass
    # Algunos modelos (ej. Haiku 4.5, visto 2026-09-02) no respetan "responde
    # ÚNICAMENTE JSON" -- envuelven el JSON en un bloque de código Markdown,
    # y a veces AGREGAN texto explicativo después del bloque (visto
    # 2026-09-04: "```json\n{...}\n```\n\nEl usuario dice que..." -- el
    # removesuffix("```") de antes no servía porque el string ya no termina
    # en "```", termina en la prosa). En vez de pelar prefijo/sufijo a
    # ciegas, se extrae el primer objeto JSON balanceado dentro del texto
    # (cuenta llaves, respeta strings) -- funciona sin importar qué haya
    # antes o después.
    if isinstance(texto, str):
        inicio = texto.find("{")
        if inicio != -1:
            profundidad = 0
            dentro_string = False
            escapando = False
            for i in range(inicio, len(texto)):
                c = texto[i]
                if escapando:
                    escapando = False
                    continue
                if c == "\\":
                    escapando = True
                    continue
                if c == '"':
                    dentro_string = not dentro_string
                    continue
                if dentro_string:
                    continue
                if c == "{":
                    profundidad += 1
                elif c == "}":
                    profundidad -= 1
                    if profundidad == 0:
                        try:
                            return json.loads(texto[inicio : i + 1])
                        except json.JSONDecodeError:
                            break
    return None


def interpretar_instruccion(db: Session, usuario: Usuario, texto: str) -> dict:
    """Devuelve {"acciones": [{"tool": str, "parametros": dict}, ...]}. Lista
    con un solo elemento tool == "no_entendido" si no aplica ninguna acción,
    o si el modelo no devolvió JSON válido ni siquiera tras un reintento."""
    mapa = None
    if settings.asistente_llm_proveedor in ("gemini", "claude"):
        mapa = construir_mapa(db, usuario)
        texto = mapa.redactar(texto)

    sistema = _construir_sistema()
    mensaje_usuario = _construir_mensaje_usuario(texto)

    datos = _parsear_json(generar_texto(mensaje_usuario, json_forzado=True, sistema=sistema))
    if datos is None:
        datos = _parsear_json(
            generar_texto(
                mensaje_usuario + "\n\nResponde SOLO el JSON, una sola línea, nada más.",
                json_forzado=True,
                sistema=sistema,
            )
        )

    sin_accion = {"acciones": [{"tool": SIN_ACCION, "parametros": {}}]}
    if not isinstance(datos, dict):
        return sin_accion

    acciones_llm = datos.get("acciones")
    if not isinstance(acciones_llm, list) or not acciones_llm:
        return sin_accion

    primera = acciones_llm[0]
    primera_tool = primera.get("tool") if isinstance(primera, dict) else None
    if primera_tool not in TOOLS and primera_tool != SIN_ACCION:
        return sin_accion

    acciones = []
    for accion in acciones_llm:
        if not isinstance(accion, dict):
            continue
        tool = accion.get("tool")
        if tool not in TOOLS and tool != SIN_ACCION:
            continue
        parametros = accion.get("parametros")
        parametros = parametros if isinstance(parametros, dict) else {}
        if mapa is not None:
            parametros = mapa.restaurar(parametros)
        acciones.append({"tool": tool, "parametros": parametros})

    return {"acciones": acciones or [{"tool": SIN_ACCION, "parametros": {}}]}

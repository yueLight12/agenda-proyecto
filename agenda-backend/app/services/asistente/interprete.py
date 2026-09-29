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


def _construir_catalogo() -> str:
    """Catálogo de herramientas (nombre + descripción + parámetros), sin
    ejemplos -- extraído de _construir_sistema (2026-09-29, rediseño
    conversacional) para reusarlo también en interpretar_seguimiento sin
    duplicar esta lista a mano en dos lugares."""
    bloques = []
    for spec in TOOLS.values():
        parametros = "; ".join(f"{campo} ({desc})" for campo, desc in spec.parametros_llm.items())
        bloques.append(f"- {spec.nombre}: {spec.descripcion}\n  parametros: {parametros}")
    return "\n".join(bloques)


def _construir_sistema() -> str:
    """Bloque ESTÁTICO -- catálogo de herramientas + ejemplos + instrucciones,
    idéntico en cada llamada (solo cambia si tools.py cambia). Separado de
    `texto` a propósito para que llm_cliente.py lo mande como bloque
    cacheado con Claude (ver generar_texto/_llamar_claude) en vez de
    reprocesarlo de cero en cada comando."""
    catalogo = _construir_catalogo()

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


def _construir_historial(historial: list) -> str:
    """Bloque de turnos recientes de ESTA conversación (memoria de corto
    plazo, 2026-09-25) -- va en el mensaje del usuario (NO en el bloque
    estático cacheado de _construir_sistema, que debe quedar idéntico en
    cada llamada). Deja que el modelo resuelva referencias a lo ya dicho
    ("ponle la misma fecha", "no, mejor a las 4") sin que el usuario tenga
    que repetir todo el contexto cada vez."""
    if not historial:
        return ""
    lineas = ["CONVERSACIÓN RECIENTE (para entender referencias a lo ya dicho, NO para repetir acciones ya hechas):"]
    for turno in historial:
        lineas.append(f'Usuario: "{turno.usuario}"')
        lineas.append(f'Asistente: "{turno.asistente}"')
    return "\n".join(lineas) + "\n\n"


def _construir_mensaje_usuario(texto: str, historial: list | None = None) -> str:
    return f'{_construir_historial(historial or [])}TEXTO DEL USUARIO: "{texto}"\nRESPUESTA:'


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


SIN_ACCION_RESPUESTA = {"acciones": [{"tool": SIN_ACCION, "parametros": {}}]}


def _normalizar_acciones(acciones_llm, mapa) -> dict:
    """Valida y limpia la lista de acciones que devolvió el LLM (nombre de
    tool real, parametros como dict, seudónimos restaurados) -- extraído de
    interpretar_instruccion (2026-09-29, rediseño conversacional) para
    reusarlo también en interpretar_seguimiento cuando el usuario corrige/
    redirige a media aclaración."""
    if not isinstance(acciones_llm, list) or not acciones_llm:
        return SIN_ACCION_RESPUESTA

    primera = acciones_llm[0]
    primera_tool = primera.get("tool") if isinstance(primera, dict) else None
    if primera_tool not in TOOLS and primera_tool != SIN_ACCION:
        return SIN_ACCION_RESPUESTA

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


def _redactar_historial(mapa, historial: list | None) -> list | None:
    if not historial or mapa is None:
        return historial
    return [
        type(turno)(usuario=mapa.redactar(turno.usuario), asistente=mapa.redactar(turno.asistente))
        for turno in historial
    ]


def interpretar_instruccion(db: Session, usuario: Usuario, texto: str, historial: list | None = None) -> dict:
    """Devuelve {"acciones": [{"tool": str, "parametros": dict}, ...]}. Lista
    con un solo elemento tool == "no_entendido" si no aplica ninguna acción,
    o si el modelo no devolvió JSON válido ni siquiera tras un reintento.

    `historial` (2026-09-25, memoria de corto plazo): turnos previos de la
    MISMA conversación del modal (ver TurnoHistorialIn) -- se redactan con
    el mismo mapa de seudónimos que `texto` antes de mandarlos, para no
    filtrar nombres reales a Gemini/Claude por esta puerta trasera."""
    mapa = None
    if settings.asistente_llm_proveedor in ("gemini", "claude"):
        mapa = construir_mapa(db, usuario)
        texto = mapa.redactar(texto)
        historial = _redactar_historial(mapa, historial)

    sistema = _construir_sistema()
    mensaje_usuario = _construir_mensaje_usuario(texto, historial)

    datos = _parsear_json(generar_texto(mensaje_usuario, json_forzado=True, sistema=sistema))
    if datos is None:
        datos = _parsear_json(
            generar_texto(
                mensaje_usuario + "\n\nResponde SOLO el JSON, una sola línea, nada más.",
                json_forzado=True,
                sistema=sistema,
            )
        )

    if not isinstance(datos, dict):
        return SIN_ACCION_RESPUESTA
    return _normalizar_acciones(datos.get("acciones"), mapa)


def interpretar_seguimiento(
    db: Session,
    usuario: Usuario,
    texto: str,
    historial: list | None,
    tool_actual: str,
    campo_pendiente: str,
    pregunta_pendiente: str,
    opciones: list | None = None,
) -> dict:
    """Rediseño conversacional de Chambeador (2026-09-29, a petición de Yue:
    "quiero un asistente que me vaya guiando con preguntas, no un formulario
    que se traba si lo corrijo") -- reemplaza el flujo anterior, donde una
    vez que el asistente preguntaba un dato faltante, CUALQUIER cosa que
    dijeras se metía a la fuerza como el valor literal de ese campo, sin
    volver a pensar. Bug real que esto corrige: Yue pidió "un pendiente
    personal", el LLM lo entendió como crear_entregable (ver el ajuste en
    tools.py el mismo día) y al corregir con "no, quiero un pendiente
    personal" esa frase completa se intentó meter como respuesta al campo
    que se estaba preguntando -- el asistente se quedó trabado.

    Ahora, cada vez que el usuario responde algo durante una aclaración, se
    le pregunta al LLM qué está pasando en vez de asumir que es una
    respuesta literal. Python sigue siendo el único que resuelve IDs/
    permisos contra la base real (ver _resolver_y_responder en el router) --
    esto SOLO decide cómo interpretar lo que se acaba de decir. Devuelve uno
    de:
      {"decision": "responder", "valor": <str>}          -- sigue la misma acción
      {"decision": "redirigir", "acciones": [...]}        -- corrección/cambio de tema, misma
                                                               forma que interpretar_instruccion
      {"decision": "cancelar"}                             -- el usuario quiere dejarlo así
    """
    mapa = None
    if settings.asistente_llm_proveedor in ("gemini", "claude"):
        mapa = construir_mapa(db, usuario)
        texto = mapa.redactar(texto)
        historial = _redactar_historial(mapa, historial)

    spec = TOOLS.get(tool_actual)
    descripcion_tool = spec.descripcion if spec else tool_actual

    partes = [_construir_historial(historial or [])]
    partes.append(
        f'Hay una acción en curso: "{tool_actual}" ({descripcion_tool}). '
        f'Todavía falta el dato "{campo_pendiente}" -- se le preguntó al usuario: "{pregunta_pendiente}"'
    )
    if opciones:
        etiquetas = ", ".join(f'"{o.etiqueta}"' for o in opciones)
        partes.append(f"Opciones ofrecidas: {etiquetas}.")
    partes.append(f'El usuario respondió: "{texto}"')
    mensaje_usuario = "\n".join(p for p in partes if p)

    sistema = f"""Eres el intérprete de comandos de voz de "Agenda Inteligente de Proyectos",
a media conversación: ya se identificó una acción pero falta un dato y se le
preguntó al usuario. Decide qué acaba de pasar y responde ÚNICAMENTE JSON,
una de estas 3 formas:

1) El usuario está respondiendo al dato que falta (aunque lo diga distinto a
como se le preguntó, o dé el dato junto con algo más):
{{"decision": "responder", "valor": "<el valor, tal como lo dijo>"}}

2) El usuario está corrigiendo o cambiando de intención -- quiere algo
DISTINTO a lo que se venía armando (puede ser la misma acción con otros
datos, o una acción completamente distinta). Trata TODO lo que dijo como una
instrucción nueva, con el mismo catálogo y formato que si fuera la primera
vez que habla:
{{"decision": "redirigir", "acciones": [{{"tool": "<nombre_tool>", "parametros": {{...}}}}]}}

HERRAMIENTAS DISPONIBLES para "redirigir" (responde con el "nombre" exacto):

{_construir_catalogo()}

- no_entendido: si lo que pide no corresponde a ninguna de arriba.
  parametros: {{}}

3) El usuario quiere cancelar/dejar esto así, sin completar la acción:
{{"decision": "cancelar"}}

NUNCA inventes IDs. Si no es claro cuál de las 3 aplica, prefiere "responder"
con el texto tal cual lo dijo el usuario."""

    datos = _parsear_json(
        generar_texto(
            mensaje_usuario,
            json_forzado=True,
            sistema=sistema,
            modelo_override=settings.claude_modelo_seguimiento,
        )
    )
    if not isinstance(datos, dict) or datos.get("decision") not in ("responder", "redirigir", "cancelar"):
        # Fallback seguro (2026-09-29): si el LLM falla o da JSON inválido,
        # se cae al comportamiento de siempre -- tratar lo dicho como
        # respuesta literal, en vez de perder la instrucción o trabarse.
        return {"decision": "responder", "valor": texto if mapa is None else mapa.restaurar(texto)}

    if datos["decision"] == "redirigir":
        return {"decision": "redirigir", **_normalizar_acciones(datos.get("acciones"), mapa)}

    if datos["decision"] == "cancelar":
        return {"decision": "cancelar"}

    valor = datos.get("valor")
    if isinstance(valor, str) and mapa is not None:
        valor = mapa.restaurar(valor)
    return {"decision": "responder", "valor": valor if valor is not None else texto}

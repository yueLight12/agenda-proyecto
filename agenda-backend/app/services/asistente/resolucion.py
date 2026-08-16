"""
Resuelve texto libre (nombres, fechas, nombres de proyecto/entregable) contra
la base de datos real. El LLM del asistente de voz nunca produce un ID — todo
ID sale de aquí, y siempre pasando por las funciones de visibilidad ya
existentes (listar_equipo_visible, listar_proyectos_visibles,
query_entregables_visibles), nunca por GET /usuarios (que exige N1 global y
rompería para N2/N3/N4 hablándole al asistente).
"""
import difflib
import re
import unicodedata
from dataclasses import dataclass, field
from datetime import datetime, time
from typing import Any, Callable, Optional

import dateparser
from sqlalchemy.orm import Session

from app.core.permissions import query_entregables_visibles, query_reuniones_visibles
from app.models.usuario import RolEnum, Usuario
from app.services.proyectos import listar_equipo_visible, listar_proyectos_visibles


@dataclass
class OpcionResolucion:
    valor: Any
    etiqueta: str


@dataclass
class ResolucionResultado:
    resuelto: bool
    valor: Any = None
    pregunta: Optional[str] = None
    tipo_entrada: Optional[str] = None  # "opciones" | "texto" | "fecha"
    opciones: list[OpcionResolucion] = field(default_factory=list)


def _normalizar(texto: str) -> str:
    texto = texto.strip().lower()
    texto = "".join(c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn")
    return texto


_PALABRAS_AUTORREFERENCIA = {"yo", "yo mismo", "yo misma", "mi", "mí", "a mi", "a mí", "me"}


def _es_autoreferencia(texto: str) -> bool:
    """El LLM a veces manda literal la palabra "yo"/"mi" cuando alguien se
    refiere a sí mismo ("y yo quedo como colaborador") — buscar eso como si
    fuera un nombre nunca encuentra a nadie. Se detecta aquí para resolver
    directo al usuario que está pidiendo la acción, en vez de un dead-end."""
    return _normalizar(texto) in _PALABRAS_AUTORREFERENCIA


def _candidatos_por_similitud(nombre_hablado: str, candidatos: list, cutoff: float = 0.65) -> list:
    """Fallback cuando el match exacto por prefijo de palabra no encuentra a
    nadie: compara lo que se dijo contra el nombre de cada candidato con
    difflib (librería estándar), de dos formas — se usa la que dé mejor
    similitud:
    - frase completa contra nombre completo: cubre el caso real de "José
      Francisco Jiménez Hazo" contra "José Francisco Jiménez Jasso" (ratio
      0.91 — Whisper transcribió bien 3 de 4 palabras, solo el apellido
      salió mal).
    - lo dicho contra CADA PALABRA del candidato por separado: cubre decir
      solo un nombre corto, ej. "Jaso" o "Hasso" contra "Jasso Ramírez"
      (ratio 0.89/0.80) — comparar contra el nombre completo ahí da una
      similitud baja solo por la diferencia de longitud.
    No ayuda cuando Whisper alucina un nombre completo sin relación real
    (para eso está el initial_prompt en whisper_client.py) — cutoff=0.65
    es conservador para no inventar coincidencias con nombres muy
    distintos."""
    normalizado = _normalizar(nombre_hablado)
    puntuados = []
    for c in candidatos:
        nombre_candidato = _normalizar(c.nombre)
        ratio_completo = difflib.SequenceMatcher(None, normalizado, nombre_candidato).ratio()
        ratio_por_palabra = max(
            (difflib.SequenceMatcher(None, normalizado, palabra).ratio() for palabra in nombre_candidato.split()),
            default=0.0,
        )
        mejor = max(ratio_completo, ratio_por_palabra)
        if mejor >= cutoff:
            puntuados.append((mejor, c))
    puntuados.sort(key=lambda par: par[0], reverse=True)
    return [c for _, c in puntuados[:4]]


def resolver_campo(
    campo: str, aclaraciones: dict, texto_original: Optional[str], resolver_fn: Callable[[Optional[str]], ResolucionResultado]
) -> ResolucionResultado:
    """
    Si `aclaraciones[campo]` ya trae un id resuelto (el usuario eligió una
    opción de una aclaración anterior), se usa directo. Si trae texto (el
    usuario respondió una pregunta de tipo "texto"/"fecha"), se vuelve a
    resolver con ese texto. Si no hay aclaración para este campo, se resuelve
    con el texto que vino originalmente del LLM.
    """
    if campo in aclaraciones:
        valor = aclaraciones[campo]
        if isinstance(valor, str):
            return resolver_fn(valor)
        return ResolucionResultado(resuelto=True, valor=valor)
    return resolver_fn(texto_original)


def resolver_proyecto(
    db: Session, usuario: Usuario, texto: Optional[str], proyecto_id_contexto: Optional[int]
) -> ResolucionResultado:
    if proyecto_id_contexto:
        return ResolucionResultado(resuelto=True, valor=proyecto_id_contexto)

    proyectos = listar_proyectos_visibles(db, usuario)
    if not proyectos:
        return ResolucionResultado(
            resuelto=False,
            pregunta="No participas en ningún proyecto todavía, así que no puedo hacer eso.",
            tipo_entrada="texto",
        )

    if texto:
        normalizado = _normalizar(texto)
        candidatos = [p for p in proyectos if normalizado in _normalizar(p.nombre)]
        if len(candidatos) == 1:
            return ResolucionResultado(resuelto=True, valor=candidatos[0].id)
        if len(candidatos) > 1:
            return ResolucionResultado(
                resuelto=False,
                pregunta=f'Encontré varios proyectos parecidos a "{texto}", ¿cuál es?',
                tipo_entrada="opciones",
                opciones=[OpcionResolucion(p.id, p.nombre) for p in candidatos],
            )
        # Cero candidatos por substring -- probar coincidencia difusa antes
        # de rendirse, mismo motivo que con nombres de personas: Whisper
        # puede transcribir mal una palabra del nombre del proyecto (ej.
        # "agenda" como "agente").
        cercanos = _candidatos_por_similitud(texto, proyectos)
        if cercanos:
            return ResolucionResultado(
                resuelto=False,
                pregunta=f'No encontré exactamente "{texto}", ¿te refieres a alguno de estos?',
                tipo_entrada="opciones",
                opciones=[OpcionResolucion(p.id, p.nombre) for p in cercanos],
            )

    if len(proyectos) == 1:
        return ResolucionResultado(resuelto=True, valor=proyectos[0].id)

    return ResolucionResultado(
        resuelto=False,
        pregunta="¿En qué proyecto?",
        tipo_entrada="opciones",
        opciones=[OpcionResolucion(p.id, p.nombre) for p in proyectos],
    )


def resolver_persona_en_equipo(
    db: Session, usuario: Usuario, proyecto_id: int, nombre_hablado: Optional[str]
) -> ResolucionResultado:
    if not nombre_hablado:
        return ResolucionResultado(resuelto=False, pregunta="¿Para quién es?", tipo_entrada="texto")
    if _es_autoreferencia(nombre_hablado):
        return ResolucionResultado(resuelto=True, valor=usuario.id)

    equipo = listar_equipo_visible(db, usuario, proyecto_id)
    normalizado = _normalizar(nombre_hablado)
    # Match por PALABRA completa (nombre o apellido), no substring libre —
    # un substring libre hace que "Ana" empate con "Diana" ("di-ANA"), lo
    # que resuelve al nombre equivocado en silencio en vez de fallar o
    # preguntar (encontrado probando editar_reunion con nombres cortos). Se
    # incluye también el nombre completo exacto, porque decir el nombre y
    # apellido completos de corrido no matchea con "empieza con" de una sola
    # palabra (se resolvería igual vía el fallback difuso, pero de una vez
    # sin pedir confirmación de más).
    candidatos = [
        m for m in equipo
        if _normalizar(m.nombre) == normalizado
        or any(palabra.startswith(normalizado) for palabra in _normalizar(m.nombre).split())
    ]

    if len(candidatos) == 1:
        return ResolucionResultado(resuelto=True, valor=candidatos[0].usuario_id)
    if not candidatos:
        cercanos = _candidatos_por_similitud(nombre_hablado, equipo)
        if cercanos:
            return ResolucionResultado(
                resuelto=False,
                pregunta=f'No encontré exactamente a "{nombre_hablado}", ¿te refieres a alguno de estos?',
                tipo_entrada="opciones",
                opciones=[OpcionResolucion(m.usuario_id, f"{m.nombre} ({m.rol.value})") for m in cercanos],
            )
        return ResolucionResultado(
            resuelto=False,
            pregunta=f'No encontré a nadie llamado "{nombre_hablado}" en tu equipo visible de este proyecto. '
            "¿Puedes decir el nombre completo?",
            tipo_entrada="texto",
        )
    return ResolucionResultado(
        resuelto=False,
        pregunta=f'Encontré varias personas parecidas a "{nombre_hablado}", ¿cuál es?',
        tipo_entrada="opciones",
        opciones=[OpcionResolucion(m.usuario_id, f"{m.nombre} ({m.rol.value})") for m in candidatos],
    )


def resolver_persona_organizacion(
    db: Session, nombre_hablado: Optional[str], usuario_actor: Optional[Usuario] = None
) -> ResolucionResultado:
    """Como resolver_persona_en_equipo, pero busca en TODOS los usuarios de la
    organización, no solo en el equipo de un proyecto — es lo que hace falta
    para agregar a alguien que todavía no participa en el proyecto (ver
    agregar_miembro en tools.py). El caller es responsable de verificar que
    quien pide la acción tiene permiso (N1/N2 del proyecto) antes de llamar
    esto, para no exponer el directorio completo a cualquiera."""
    if not nombre_hablado:
        return ResolucionResultado(resuelto=False, pregunta="¿A quién quieres agregar?", tipo_entrada="texto")
    if usuario_actor and _es_autoreferencia(nombre_hablado):
        return ResolucionResultado(resuelto=True, valor=usuario_actor.id)

    usuarios = db.query(Usuario).all()
    normalizado = _normalizar(nombre_hablado)
    candidatos = [
        u for u in usuarios
        if _normalizar(u.nombre) == normalizado
        or any(palabra.startswith(normalizado) for palabra in _normalizar(u.nombre).split())
    ]

    if len(candidatos) == 1:
        return ResolucionResultado(resuelto=True, valor=candidatos[0].id)
    if not candidatos:
        cercanos = _candidatos_por_similitud(nombre_hablado, usuarios)
        if cercanos:
            return ResolucionResultado(
                resuelto=False,
                pregunta=f'No encontré exactamente a "{nombre_hablado}", ¿te refieres a alguno de estos?',
                tipo_entrada="opciones",
                opciones=[OpcionResolucion(u.id, u.nombre) for u in cercanos],
            )
        return ResolucionResultado(
            resuelto=False,
            pregunta=f'No encontré a nadie llamado "{nombre_hablado}" en el sistema. '
            "¿Puedes decir el nombre completo?",
            tipo_entrada="texto",
        )
    return ResolucionResultado(
        resuelto=False,
        pregunta=f'Encontré varias personas parecidas a "{nombre_hablado}", ¿cuál es?',
        tipo_entrada="opciones",
        opciones=[OpcionResolucion(u.id, u.nombre) for u in candidatos],
    )


def resolver_entregable(
    db: Session, usuario: Usuario, proyecto_id: int, nombre_hablado: Optional[str]
) -> ResolucionResultado:
    if not nombre_hablado:
        return ResolucionResultado(resuelto=False, pregunta="¿Cuál entregable?", tipo_entrada="texto")

    entregables = query_entregables_visibles(db, usuario, proyecto_id).all()
    normalizado = _normalizar(nombre_hablado)
    candidatos = [e for e in entregables if normalizado in _normalizar(e.nombre)]

    if len(candidatos) == 1:
        return ResolucionResultado(resuelto=True, valor=candidatos[0].id)
    if not candidatos:
        return ResolucionResultado(
            resuelto=False,
            pregunta=f'No encontré ningún entregable llamado "{nombre_hablado}" en este proyecto. '
            "¿Cuál es el nombre exacto?",
            tipo_entrada="texto",
        )
    return ResolucionResultado(
        resuelto=False,
        pregunta=f'Encontré varios entregables parecidos a "{nombre_hablado}", ¿cuál es?',
        tipo_entrada="opciones",
        opciones=[OpcionResolucion(e.id, e.nombre) for e in candidatos],
    )


_PREFIJO_ARTICULO = re.compile(r"^(para\s+)?(el|la|los|las)\s+(d[ií]as?\s*,?\s*)?", flags=re.IGNORECASE)


def resolver_fecha(texto: Optional[str]) -> ResolucionResultado:
    if not texto:
        return ResolucionResultado(resuelto=False, pregunta="¿Para qué fecha?", tipo_entrada="fecha")

    opciones_parseo = {"languages": ["es"], "settings": {"PREFER_DATES_FROM": "future"}}
    dt = dateparser.parse(texto, **opciones_parseo)
    if not dt:
        # dateparser a veces no reconoce fechas con artículo delante
        # ("el viernes"); reintenta sin el artículo antes de rendirse.
        sin_articulo = _PREFIJO_ARTICULO.sub("", texto.strip())
        if sin_articulo != texto.strip():
            dt = dateparser.parse(sin_articulo, **opciones_parseo)
    if not dt:
        return ResolucionResultado(
            resuelto=False,
            pregunta=f'No entendí la fecha "{texto}". ¿Puedes decirla de otra forma (ej. "el viernes" o "15 de agosto")?',
            tipo_entrada="fecha",
        )
    return ResolucionResultado(resuelto=True, valor=dt.date())


_RE_HORA_AMPM = re.compile(r"\b(\d{1,2})(?::(\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?)\b", re.IGNORECASE)
_RE_HORA_PERIODO = re.compile(
    r"\b(\d{1,2})(?::(\d{2}))?\s*(?:de\s+la|de\s+el)\s*(mañana|tarde|noche|madrugada)\b", re.IGNORECASE
)
_RE_MEDIODIA = re.compile(r"\bmedio\s*d[ií]a\b", re.IGNORECASE)
_RE_MEDIANOCHE = re.compile(r"\bmedia\s*noche\b", re.IGNORECASE)
_RE_HORA_SIMPLE = re.compile(r"\ba\s+las?\s+(\d{1,2})(?::(\d{2}))?\b", re.IGNORECASE)


def _extraer_hora(texto: str) -> tuple[Optional[tuple[int, int]], str]:
    """Busca una hora en el texto con reglas propias (NO se le confía esto a
    dateparser: en pruebas, su parseo combinado de fecha+hora en español
    falla silenciosamente con frases tan comunes como "de la mañana"/"tarde",
    o incluso llega a interpretar mal el día). Devuelve ((hora, minuto),
    texto_sin_esa_parte) o (None, texto original) si no encontró hora.
    """
    if _RE_MEDIODIA.search(texto):
        return (12, 0), _RE_MEDIODIA.sub("", texto)
    if _RE_MEDIANOCHE.search(texto):
        return (0, 0), _RE_MEDIANOCHE.sub("", texto)

    m = _RE_HORA_AMPM.search(texto)
    if m:
        hora = int(m.group(1)) % 12
        minuto = int(m.group(2) or 0)
        if m.group(3).lower().replace(".", "").replace(" ", "").startswith("p"):
            hora += 12
        return (hora, minuto), texto[: m.start()] + texto[m.end():]

    m = _RE_HORA_PERIODO.search(texto)
    if m:
        hora = int(m.group(1)) % 12
        minuto = int(m.group(2) or 0)
        if m.group(3).lower() in ("tarde", "noche"):
            hora += 12
        return (hora, minuto), texto[: m.start()] + texto[m.end():]

    m = _RE_HORA_SIMPLE.search(texto)
    if m:
        hora = int(m.group(1))
        minuto = int(m.group(2) or 0)
        # Sin am/pm explícito: "a las 1"-"a las 6" es casi siempre de tarde
        # en un contexto de reuniones de trabajo (nadie agenda a la 1am).
        if 1 <= hora <= 6:
            hora += 12
        return (hora, minuto), texto[: m.start()] + texto[m.end():]

    return None, texto


def resolver_fecha_hora(texto: Optional[str]) -> ResolucionResultado:
    """Como resolver_fecha, pero conserva la hora (para reuniones). La hora
    se extrae por separado (ver _extraer_hora) y la fecha se resuelve con el
    mismo resolver_fecha ya probado — nunca se le pide a dateparser que
    combine fecha+hora en un solo parseo en español, porque falla demasiado
    seguido. Si el texto no trae hora explícita, se asume 9:00am.
    """
    if not texto:
        return ResolucionResultado(resuelto=False, pregunta="¿Qué día y a qué hora?", tipo_entrada="fecha")

    hora_extraida, texto_sin_hora = _extraer_hora(texto)
    fecha_res = resolver_fecha(texto_sin_hora if hora_extraida else texto)
    if not fecha_res.resuelto:
        return ResolucionResultado(
            resuelto=False,
            pregunta=f'No entendí la fecha "{texto}". ¿Puedes decirla de otra forma (ej. "el jueves a las 3 de la tarde")?',
            tipo_entrada="fecha",
        )

    hora, minuto = hora_extraida if hora_extraida else (9, 0)
    return ResolucionResultado(resuelto=True, valor=datetime.combine(fecha_res.valor, time(hour=hora, minute=minuto)))


def resolver_rol(texto: Optional[str]) -> ResolucionResultado:
    if not texto:
        return ResolucionResultado(
            resuelto=False,
            pregunta="¿Qué rol le asigno? (dirección, líder, colaborador interno o externo)",
            tipo_entrada="texto",
        )
    normalizado = _normalizar(texto)
    if "n1" in normalizado or "direccion" in normalizado:
        return ResolucionResultado(resuelto=True, valor=RolEnum.N1)
    if "n2" in normalizado or "lider" in normalizado:
        return ResolucionResultado(resuelto=True, valor=RolEnum.N2)
    if "n4" in normalizado or "externo" in normalizado:
        return ResolucionResultado(resuelto=True, valor=RolEnum.N4)
    if "n3" in normalizado or "interno" in normalizado or "colaborador" in normalizado:
        return ResolucionResultado(resuelto=True, valor=RolEnum.N3)
    return ResolucionResultado(
        resuelto=False,
        pregunta=f'No reconozco el rol "{texto}". ¿Es dirección, líder, colaborador interno o externo?',
        tipo_entrada="texto",
    )


def resolver_personas_en_equipo(
    db: Session, usuario: Usuario, proyecto_id: int, texto: Optional[str]
) -> ResolucionResultado:
    """Resuelve varios nombres a la vez (ej. "David y Bernardo"), reutilizando
    resolver_persona_en_equipo por cada nombre. Texto vacío = sin participantes
    adicionales (válido, ej. una reunión solo con quien la agenda)."""
    if not texto:
        return ResolucionResultado(resuelto=True, valor=[])

    nombres = [n.strip() for n in re.split(r"\s*(?:,|;|\by\b)\s*", texto, flags=re.IGNORECASE) if n.strip()]
    ids: list[int] = []
    no_identificados: list[str] = []
    for nombre in nombres:
        resultado = resolver_persona_en_equipo(db, usuario, proyecto_id, nombre)
        if resultado.resuelto:
            ids.append(resultado.valor)
        else:
            no_identificados.append(nombre)

    if no_identificados:
        return ResolucionResultado(
            resuelto=False,
            pregunta=f'No identifiqué a: {", ".join(no_identificados)}. Dime sus nombres completos, separados por "y".',
            tipo_entrada="texto",
        )
    return ResolucionResultado(resuelto=True, valor=ids)


def resolver_reunion(
    db: Session, usuario: Usuario, proyecto_id: int, nombre_hablado: Optional[str]
) -> ResolucionResultado:
    if not nombre_hablado:
        return ResolucionResultado(resuelto=False, pregunta="¿Cuál reunión?", tipo_entrada="texto")

    reuniones = query_reuniones_visibles(db, usuario, proyecto_id).all()
    normalizado = _normalizar(nombre_hablado)
    candidatos = [r for r in reuniones if normalizado in _normalizar(r.titulo)]

    if len(candidatos) == 1:
        return ResolucionResultado(resuelto=True, valor=candidatos[0].id)
    if not candidatos:
        return ResolucionResultado(
            resuelto=False,
            pregunta=f'No encontré ninguna reunión llamada "{nombre_hablado}" en este proyecto. '
            "¿Cuál es el título exacto?",
            tipo_entrada="texto",
        )
    return ResolucionResultado(
        resuelto=False,
        pregunta=f'Encontré varias reuniones parecidas a "{nombre_hablado}", ¿cuál es?',
        tipo_entrada="opciones",
        opciones=[
            OpcionResolucion(r.id, f"{r.titulo} ({r.fecha_inicio.strftime('%d/%m %H:%M')})") for r in candidatos
        ],
    )

"""
Resuelve texto libre (nombres, fechas, nombres de proyecto/entregable) contra
la base de datos real. El LLM del asistente de voz nunca produce un ID — todo
ID sale de aquí, y siempre pasando por las funciones de visibilidad ya
existentes (listar_equipo_visible, listar_proyectos_visibles,
query_entregables_visibles), nunca por GET /usuarios (que exige N1 global y
rompería para N2/N3/N4 hablándole al asistente).
"""
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

    equipo = listar_equipo_visible(db, usuario, proyecto_id)
    normalizado = _normalizar(nombre_hablado)
    # Match por PALABRA completa (nombre o apellido), no substring libre —
    # un substring libre hace que "Ana" empate con "Diana" ("di-ANA"), lo
    # que resuelve al nombre equivocado en silencio en vez de fallar o
    # preguntar (encontrado probando editar_reunion con nombres cortos).
    candidatos = [
        m for m in equipo
        if any(palabra.startswith(normalizado) for palabra in _normalizar(m.nombre).split())
    ]

    if len(candidatos) == 1:
        return ResolucionResultado(resuelto=True, valor=candidatos[0].usuario_id)
    if not candidatos:
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


_PREFIJO_ARTICULO = re.compile(r"^(para\s+)?(el|la|los|las)\s+", flags=re.IGNORECASE)


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

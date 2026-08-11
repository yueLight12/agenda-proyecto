"""
Catálogo de acciones ("tools") que el asistente de voz puede ejecutar.

Cada tool tiene:
- `resolver`: recibe el texto libre que extrajo el LLM (nombres, fechas,
  números) más cualquier aclaración ya respondida por el usuario, y devuelve
  o bien una propuesta lista para confirmar (con IDs reales, resueltos
  contra la base de datos), o una pregunta de aclaración si algo falta o es
  ambiguo.
- `ejecutar`: recibe los parámetros YA resueltos (con IDs) y llama a la
  MISMA función de servicio que usa la API REST — nunca lógica de permisos
  nueva. Los 403/404/400 de siempre se re-validan aquí, en el momento de
  ejecutar.

Fase 1 (validar el mecanismo): `crear_entregable` y
`actualizar_avance_entregable`. Fase 2: se agregaron `crear_proyecto`,
`agendar_reunion`, `asignar_rol` y `registrar_acuerdo`, siguiendo este mismo
patrón — ver el plan del Milestone B.
"""
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

from sqlalchemy.orm import Session

from app.core.permissions import requerir_participacion_en_proyecto
from app.models.minuta import Minuta
from app.models.usuario import RolEnum, Usuario
from app.services.asistente.resolucion import (
    OpcionResolucion,
    resolver_campo,
    resolver_entregable,
    resolver_fecha,
    resolver_fecha_hora,
    resolver_persona_en_equipo,
    resolver_personas_en_equipo,
    resolver_proyecto,
    resolver_reunion,
    resolver_rol,
)
from app.services.entregables import actualizar_avance, crear_entregable
from app.services.minutas import agregar_acuerdo, crear_o_actualizar_minuta
from app.services.proyectos import asignar_rol_en_proyecto, crear_proyecto
from app.services.reuniones import crear_reunion


@dataclass
class ResultadoInterpretacion:
    listo: bool
    parametros: Optional[dict] = None
    resumen: Optional[str] = None
    campo: Optional[str] = None
    pregunta: Optional[str] = None
    tipo_entrada: Optional[str] = None
    opciones: list[OpcionResolucion] = field(default_factory=list)


def _pendiente(campo: str, resolucion) -> ResultadoInterpretacion:
    return ResultadoInterpretacion(
        listo=False,
        campo=campo,
        pregunta=resolucion.pregunta,
        tipo_entrada=resolucion.tipo_entrada,
        opciones=resolucion.opciones,
    )


@dataclass
class ToolSpec:
    nombre: str
    descripcion: str
    parametros_llm: dict[str, str]
    ejemplos: list[tuple[str, dict]]
    resolver: Callable[[Session, Usuario, Optional[int], dict, dict], ResultadoInterpretacion]
    ejecutar: Callable[[Session, Usuario, dict], dict]


# --- crear_entregable ---------------------------------------------------

def _resolver_crear_entregable(
    db: Session, usuario: Usuario, proyecto_id_contexto: Optional[int], parametros_llm: dict, aclaraciones: dict
) -> ResultadoInterpretacion:
    proyecto_res = resolver_campo(
        "proyecto_id", aclaraciones, parametros_llm.get("proyecto"),
        lambda t: resolver_proyecto(db, usuario, t, proyecto_id_contexto),
    )
    if not proyecto_res.resuelto:
        return _pendiente("proyecto_id", proyecto_res)
    proyecto_id = proyecto_res.valor

    nombre = (
        aclaraciones.get("nombre") if isinstance(aclaraciones.get("nombre"), str) else parametros_llm.get("nombre")
    )
    nombre = (nombre or "").strip()
    if not nombre:
        return ResultadoInterpretacion(
            listo=False, campo="nombre", pregunta="¿Cómo se llama el entregable?", tipo_entrada="texto"
        )

    texto_responsable = parametros_llm.get("responsable") or usuario.nombre
    responsable_res = resolver_campo(
        "responsable_id", aclaraciones, texto_responsable,
        lambda t: resolver_persona_en_equipo(db, usuario, proyecto_id, t),
    )
    if not responsable_res.resuelto:
        return _pendiente("responsable_id", responsable_res)

    fecha_res = resolver_campo(
        "fecha_entrega", aclaraciones, parametros_llm.get("fecha_entrega"),
        lambda t: resolver_fecha(t),
    )
    if not fecha_res.resuelto:
        return _pendiente("fecha_entrega", fecha_res)

    parametros = {
        "proyecto_id": proyecto_id,
        "nombre": nombre,
        "descripcion": parametros_llm.get("descripcion") or None,
        "responsable_id": responsable_res.valor,
        "fecha_entrega": fecha_res.valor.isoformat(),
        "sensible": bool(parametros_llm.get("sensible") or False),
    }
    resumen = f'Voy a crear el entregable "{nombre}", con fecha límite {fecha_res.valor.isoformat()}. ¿Confirmas?'
    return ResultadoInterpretacion(listo=True, parametros=parametros, resumen=resumen)


def _ejecutar_crear_entregable(db: Session, usuario: Usuario, parametros: dict) -> dict:
    from datetime import date

    rol = requerir_participacion_en_proyecto(db, usuario, parametros["proyecto_id"])
    nuevo = crear_entregable(
        db,
        parametros["proyecto_id"],
        usuario,
        rol,
        nombre=parametros["nombre"],
        descripcion=parametros.get("descripcion"),
        responsable_id=parametros["responsable_id"],
        fecha_entrega=date.fromisoformat(parametros["fecha_entrega"]),
        sensible=parametros.get("sensible", False),
    )
    db.commit()
    db.refresh(nuevo)
    return {
        "mensaje": f'Entregable "{nuevo.nombre}" creado correctamente.',
        "resultado": {"id": nuevo.id, "nombre": nuevo.nombre},
    }


# --- actualizar_avance_entregable ---------------------------------------

def _resolver_actualizar_avance(
    db: Session, usuario: Usuario, proyecto_id_contexto: Optional[int], parametros_llm: dict, aclaraciones: dict
) -> ResultadoInterpretacion:
    proyecto_res = resolver_campo(
        "proyecto_id", aclaraciones, parametros_llm.get("proyecto"),
        lambda t: resolver_proyecto(db, usuario, t, proyecto_id_contexto),
    )
    if not proyecto_res.resuelto:
        return _pendiente("proyecto_id", proyecto_res)
    proyecto_id = proyecto_res.valor

    entregable_res = resolver_campo(
        "entregable_id", aclaraciones, parametros_llm.get("entregable"),
        lambda t: resolver_entregable(db, usuario, proyecto_id, t),
    )
    if not entregable_res.resuelto:
        return _pendiente("entregable_id", entregable_res)

    porcentaje_bruto = aclaraciones.get("porcentaje", parametros_llm.get("porcentaje"))
    try:
        porcentaje = max(0, min(100, int(porcentaje_bruto)))
    except (TypeError, ValueError):
        return ResultadoInterpretacion(
            listo=False,
            campo="porcentaje",
            pregunta="¿A cuánto por ciento quieres poner el avance? (di un número del 0 al 100)",
            tipo_entrada="texto",
        )

    parametros = {"entregable_id": entregable_res.valor, "porcentaje_avance": porcentaje}
    resumen = f"Voy a poner el avance en {porcentaje}%. ¿Confirmas?"
    return ResultadoInterpretacion(listo=True, parametros=parametros, resumen=resumen)


def _ejecutar_actualizar_avance(db: Session, usuario: Usuario, parametros: dict) -> dict:
    entregable = actualizar_avance(db, usuario, parametros["entregable_id"], parametros["porcentaje_avance"])
    db.commit()
    db.refresh(entregable)
    return {
        "mensaje": f'Avance de "{entregable.nombre}" actualizado a {entregable.porcentaje_avance}%.',
        "resultado": {"id": entregable.id, "porcentaje_avance": entregable.porcentaje_avance},
    }


# --- crear_proyecto ------------------------------------------------------

def _resolver_crear_proyecto(
    db: Session, usuario: Usuario, proyecto_id_contexto: Optional[int], parametros_llm: dict, aclaraciones: dict
) -> ResultadoInterpretacion:
    nombre = (
        aclaraciones.get("nombre") if isinstance(aclaraciones.get("nombre"), str) else parametros_llm.get("nombre")
    )
    nombre = (nombre or "").strip()
    if not nombre:
        return ResultadoInterpretacion(
            listo=False, campo="nombre", pregunta="¿Cómo se llama el proyecto?", tipo_entrada="texto"
        )

    parametros = {"nombre": nombre, "descripcion": parametros_llm.get("descripcion") or None}
    resumen = f'Voy a crear el proyecto "{nombre}". Quedarás como dirección (N1). ¿Confirmas?'
    return ResultadoInterpretacion(listo=True, parametros=parametros, resumen=resumen)


def _ejecutar_crear_proyecto(db: Session, usuario: Usuario, parametros: dict) -> dict:
    nuevo = crear_proyecto(db, usuario, parametros["nombre"], parametros.get("descripcion"))
    db.commit()
    db.refresh(nuevo)
    return {
        "mensaje": f'Proyecto "{nuevo.nombre}" creado correctamente.',
        "resultado": {"id": nuevo.id, "nombre": nuevo.nombre},
    }


# --- agendar_reunion ------------------------------------------------------

def _resolver_agendar_reunion(
    db: Session, usuario: Usuario, proyecto_id_contexto: Optional[int], parametros_llm: dict, aclaraciones: dict
) -> ResultadoInterpretacion:
    proyecto_res = resolver_campo(
        "proyecto_id", aclaraciones, parametros_llm.get("proyecto"),
        lambda t: resolver_proyecto(db, usuario, t, proyecto_id_contexto),
    )
    if not proyecto_res.resuelto:
        return _pendiente("proyecto_id", proyecto_res)
    proyecto_id = proyecto_res.valor

    titulo = (
        aclaraciones.get("titulo") if isinstance(aclaraciones.get("titulo"), str) else parametros_llm.get("titulo")
    )
    titulo = (titulo or "").strip()
    if not titulo:
        return ResultadoInterpretacion(
            listo=False, campo="titulo", pregunta="¿Cuál es el tema o título de la reunión?", tipo_entrada="texto"
        )

    fecha_res = resolver_campo(
        "fecha_inicio", aclaraciones, parametros_llm.get("fecha_inicio"),
        resolver_fecha_hora,
    )
    if not fecha_res.resuelto:
        return _pendiente("fecha_inicio", fecha_res)

    participantes_res = resolver_campo(
        "participantes_ids", aclaraciones, parametros_llm.get("participantes"),
        lambda t: resolver_personas_en_equipo(db, usuario, proyecto_id, t),
    )
    if not participantes_res.resuelto:
        return _pendiente("participantes_ids", participantes_res)

    try:
        duracion = int(parametros_llm.get("duracion_minutos") or 30)
    except (TypeError, ValueError):
        duracion = 30

    parametros = {
        "proyecto_id": proyecto_id,
        "titulo": titulo,
        "fecha_inicio": fecha_res.valor.isoformat(),
        "duracion_minutos": duracion,
        "participantes_ids": participantes_res.valor,
    }
    resumen = f'Voy a agendar "{titulo}" para el {fecha_res.valor.strftime("%d/%m/%Y a las %H:%M")}. ¿Confirmas?'
    return ResultadoInterpretacion(listo=True, parametros=parametros, resumen=resumen)


def _ejecutar_agendar_reunion(db: Session, usuario: Usuario, parametros: dict) -> dict:
    from datetime import datetime

    nueva = crear_reunion(
        db,
        usuario,
        parametros["proyecto_id"],
        parametros["titulo"],
        None,
        datetime.fromisoformat(parametros["fecha_inicio"]),
        parametros["duracion_minutos"],
        parametros["participantes_ids"],
    )
    db.commit()
    db.refresh(nueva)
    return {
        "mensaje": f'Reunión "{nueva.titulo}" agendada correctamente.',
        "resultado": {"id": nueva.id, "titulo": nueva.titulo},
    }


# --- asignar_rol -----------------------------------------------------------

def _resolver_asignar_rol(
    db: Session, usuario: Usuario, proyecto_id_contexto: Optional[int], parametros_llm: dict, aclaraciones: dict
) -> ResultadoInterpretacion:
    proyecto_res = resolver_campo(
        "proyecto_id", aclaraciones, parametros_llm.get("proyecto"),
        lambda t: resolver_proyecto(db, usuario, t, proyecto_id_contexto),
    )
    if not proyecto_res.resuelto:
        return _pendiente("proyecto_id", proyecto_res)
    proyecto_id = proyecto_res.valor

    persona_res = resolver_campo(
        "usuario_id", aclaraciones, parametros_llm.get("persona"),
        lambda t: resolver_persona_en_equipo(db, usuario, proyecto_id, t),
    )
    if not persona_res.resuelto:
        return _pendiente("usuario_id", persona_res)

    rol_res = resolver_campo("rol", aclaraciones, parametros_llm.get("rol"), resolver_rol)
    if not rol_res.resuelto:
        return _pendiente("rol", rol_res)

    supervisor_id = None
    if rol_res.valor in (RolEnum.N3, RolEnum.N4):
        aclaracion_supervisor = aclaraciones.get("supervisor_id")
        if isinstance(aclaracion_supervisor, int):
            supervisor_id = aclaracion_supervisor
        else:
            texto_supervisor = aclaracion_supervisor if isinstance(aclaracion_supervisor, str) else parametros_llm.get("supervisor")
            if texto_supervisor:
                supervisor_res = resolver_persona_en_equipo(db, usuario, proyecto_id, texto_supervisor)
                if not supervisor_res.resuelto:
                    return _pendiente("supervisor_id", supervisor_res)
                supervisor_id = supervisor_res.valor

    persona = db.query(Usuario).filter(Usuario.id == persona_res.valor).first()
    nombre_persona = persona.nombre if persona else "esa persona"

    parametros = {
        "proyecto_id": proyecto_id,
        "usuario_id": persona_res.valor,
        "rol": rol_res.valor.value,
        "supervisor_id": supervisor_id,
    }
    resumen = f'Voy a asignar a {nombre_persona} como {rol_res.valor.value} en este proyecto. ¿Confirmas?'
    return ResultadoInterpretacion(listo=True, parametros=parametros, resumen=resumen)


def _ejecutar_asignar_rol(db: Session, usuario: Usuario, parametros: dict) -> dict:
    resultado = asignar_rol_en_proyecto(
        db,
        usuario,
        parametros["proyecto_id"],
        parametros["usuario_id"],
        RolEnum(parametros["rol"]),
        parametros.get("supervisor_id"),
    )
    db.commit()
    return {
        "mensaje": f"{resultado.nombre} quedó asignado como {resultado.rol.value} en el proyecto.",
        "resultado": {"usuario_id": resultado.usuario_id, "rol": resultado.rol.value},
    }


# --- registrar_acuerdo (minutas) -------------------------------------------

def _resolver_registrar_acuerdo(
    db: Session, usuario: Usuario, proyecto_id_contexto: Optional[int], parametros_llm: dict, aclaraciones: dict
) -> ResultadoInterpretacion:
    proyecto_res = resolver_campo(
        "proyecto_id", aclaraciones, parametros_llm.get("proyecto"),
        lambda t: resolver_proyecto(db, usuario, t, proyecto_id_contexto),
    )
    if not proyecto_res.resuelto:
        return _pendiente("proyecto_id", proyecto_res)
    proyecto_id = proyecto_res.valor

    reunion_res = resolver_campo(
        "reunion_id", aclaraciones, parametros_llm.get("reunion"),
        lambda t: resolver_reunion(db, usuario, proyecto_id, t),
    )
    if not reunion_res.resuelto:
        return _pendiente("reunion_id", reunion_res)

    descripcion = (
        aclaraciones.get("descripcion")
        if isinstance(aclaraciones.get("descripcion"), str)
        else parametros_llm.get("descripcion")
    )
    descripcion = (descripcion or "").strip()
    if not descripcion:
        return ResultadoInterpretacion(
            listo=False, campo="descripcion", pregunta="¿Cuál es el acuerdo?", tipo_entrada="texto"
        )

    responsable_id = None
    aclaracion_responsable = aclaraciones.get("responsable_id")
    if isinstance(aclaracion_responsable, int):
        responsable_id = aclaracion_responsable
    else:
        texto_responsable = aclaracion_responsable if isinstance(aclaracion_responsable, str) else parametros_llm.get("responsable")
        if texto_responsable:
            responsable_res = resolver_persona_en_equipo(db, usuario, proyecto_id, texto_responsable)
            if not responsable_res.resuelto:
                return _pendiente("responsable_id", responsable_res)
            responsable_id = responsable_res.valor

    parametros = {
        "reunion_id": reunion_res.valor,
        "descripcion": descripcion,
        "responsable_id": responsable_id,
    }
    resumen = f'Voy a agregar el acuerdo "{descripcion}" a la minuta. ¿Confirmas?'
    return ResultadoInterpretacion(listo=True, parametros=parametros, resumen=resumen)


def _ejecutar_registrar_acuerdo(db: Session, usuario: Usuario, parametros: dict) -> dict:
    minuta = db.query(Minuta).filter(Minuta.reunion_id == parametros["reunion_id"]).first()
    if minuta is None:
        # Sin minuta previa: se crea vacía (sin contenido) — si ya existiera,
        # NO se debe llamar aquí con contenido=None, porque borraría el
        # contenido existente. agregar_acuerdo revalida permisos de todos modos.
        minuta = crear_o_actualizar_minuta(db, usuario, parametros["reunion_id"], None)
        db.flush()

    acuerdo = agregar_acuerdo(db, usuario, minuta.id, parametros["descripcion"], parametros.get("responsable_id"))
    db.commit()
    db.refresh(acuerdo)
    return {
        "mensaje": f'Acuerdo agregado a la minuta: "{acuerdo.descripcion}".',
        "resultado": {"id": acuerdo.id, "minuta_id": minuta.id},
    }


TOOLS: dict[str, ToolSpec] = {
    "crear_entregable": ToolSpec(
        nombre="crear_entregable",
        descripcion="Crear una nueva tarea/entregable con fecha límite dentro de un proyecto.",
        parametros_llm={
            "nombre": "nombre del entregable",
            "descripcion": "descripción opcional, o null si no se dijo",
            "responsable": "nombre de la persona a quien se asigna, tal como se mencionó; si no se dijo, dejar vacío (se autoasigna a quien habla)",
            "fecha_entrega": "fecha límite tal como se dijo en el texto (ej. 'el viernes', 'en dos semanas')",
            "proyecto": "nombre del proyecto si se mencionó, si no dejar vacío",
            "sensible": "true o false, si se dijo que es sensible/confidencial (default false)",
        },
        ejemplos=[
            (
                "crea un entregable para David, el informe de ventas, para el viernes",
                {
                    "nombre": "informe de ventas",
                    "descripcion": None,
                    "responsable": "David",
                    "fecha_entrega": "el viernes",
                    "proyecto": "",
                    "sensible": False,
                },
            ),
            (
                "agrégame una tarea de revisar el contrato para mañana",
                {
                    "nombre": "revisar el contrato",
                    "descripcion": None,
                    "responsable": "",
                    "fecha_entrega": "mañana",
                    "proyecto": "",
                    "sensible": False,
                },
            ),
        ],
        resolver=_resolver_crear_entregable,
        ejecutar=_ejecutar_crear_entregable,
    ),
    "actualizar_avance_entregable": ToolSpec(
        nombre="actualizar_avance_entregable",
        descripcion="Actualizar el porcentaje de avance de un entregable que ya existe.",
        parametros_llm={
            "entregable": "nombre del entregable tal como se mencionó",
            "porcentaje": "número entero de 0 a 100",
            "proyecto": "nombre del proyecto si se mencionó, si no dejar vacío",
        },
        ejemplos=[
            (
                "pon el avance de la maqueta en 80 por ciento",
                {"entregable": "la maqueta", "porcentaje": 80, "proyecto": ""},
            ),
            (
                "ya terminé el informe de ventas",
                {"entregable": "informe de ventas", "porcentaje": 100, "proyecto": ""},
            ),
        ],
        resolver=_resolver_actualizar_avance,
        ejecutar=_ejecutar_actualizar_avance,
    ),
    "crear_proyecto": ToolSpec(
        nombre="crear_proyecto",
        descripcion="Crear un nuevo proyecto. Quien lo crea queda automáticamente como dirección (N1) de ese proyecto.",
        parametros_llm={
            "nombre": "nombre del proyecto",
            "descripcion": "descripción opcional, o null si no se dijo",
        },
        ejemplos=[
            (
                "crea un proyecto nuevo llamado Expansión Norte",
                {"nombre": "Expansión Norte", "descripcion": None},
            ),
        ],
        resolver=_resolver_crear_proyecto,
        ejecutar=_ejecutar_crear_proyecto,
    ),
    "agendar_reunion": ToolSpec(
        nombre="agendar_reunion",
        descripcion="Agendar una reunión dentro de un proyecto, con título, fecha/hora y participantes opcionales.",
        parametros_llm={
            "titulo": "tema o título de la reunión",
            "fecha_inicio": "fecha y hora tal como se dijo (ej. 'el jueves a las 3pm', 'mañana a las 10 de la mañana')",
            "duracion_minutos": "número de minutos que dura, o null si no se dijo (por defecto 30)",
            "participantes": "nombres de los invitados tal como se mencionaron, separados por 'y'; vacío si no se dijo",
            "proyecto": "nombre del proyecto si se mencionó, si no dejar vacío",
        },
        ejemplos=[
            (
                "agenda una reunión con David el jueves a las 3pm",
                {
                    "titulo": "reunión con David",
                    "fecha_inicio": "el jueves a las 3pm",
                    "duracion_minutos": None,
                    "participantes": "David",
                    "proyecto": "",
                },
            ),
            (
                "cita al equipo mañana a las 10 de la mañana para revisar avances, media hora",
                {
                    "titulo": "revisar avances",
                    "fecha_inicio": "mañana a las 10 de la mañana",
                    "duracion_minutos": 30,
                    "participantes": "",
                    "proyecto": "",
                },
            ),
        ],
        resolver=_resolver_agendar_reunion,
        ejecutar=_ejecutar_agendar_reunion,
    ),
    "asignar_rol": ToolSpec(
        nombre="asignar_rol",
        descripcion="Cambiar el rol (dirección/líder/colaborador interno/externo) de alguien que YA participa en el proyecto. No sirve para agregar a alguien nuevo al proyecto.",
        parametros_llm={
            "persona": "nombre de la persona tal como se mencionó",
            "rol": "rol tal como se dijo (dirección, líder, colaborador interno, colaborador externo, N1-N4)",
            "supervisor": "nombre de quien lo supervisa, solo si se dijo y el rol es colaborador interno/externo; si no, vacío",
            "proyecto": "nombre del proyecto si se mencionó, si no dejar vacío",
        },
        ejemplos=[
            (
                "pon a Bernardo como líder de este proyecto",
                {"persona": "Bernardo", "rol": "líder", "supervisor": "", "proyecto": ""},
            ),
            (
                "agrega a Ana como colaboradora externa, que la supervise Bernardo",
                {"persona": "Ana", "rol": "colaboradora externa", "supervisor": "Bernardo", "proyecto": ""},
            ),
        ],
        resolver=_resolver_asignar_rol,
        ejecutar=_ejecutar_asignar_rol,
    ),
    "registrar_acuerdo": ToolSpec(
        nombre="registrar_acuerdo",
        descripcion="Agregar un acuerdo a la minuta de una reunión que ya existe, con responsable opcional.",
        parametros_llm={
            "reunion": "título de la reunión tal como se mencionó",
            "descripcion": "en qué consiste el acuerdo",
            "responsable": "nombre de quien es responsable del acuerdo, si se dijo; si no, vacío",
            "proyecto": "nombre del proyecto si se mencionó, si no dejar vacío",
        },
        ejemplos=[
            (
                "agrega un acuerdo a la minuta de la reunión de revisión de presupuesto: enviar el reporte final, responsable Ana",
                {
                    "reunion": "revisión de presupuesto",
                    "descripcion": "enviar el reporte final",
                    "responsable": "Ana",
                    "proyecto": "",
                },
            ),
        ],
        resolver=_resolver_registrar_acuerdo,
        ejecutar=_ejecutar_registrar_acuerdo,
    ),
}

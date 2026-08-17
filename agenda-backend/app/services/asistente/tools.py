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
patrón — ver el plan del Milestone B. Milestone C (2026-08-13): se agregaron
`agregar_nota`, `editar_reunion`, `editar_entregable`, `editar_proyecto`
(mismo patrón, envolviendo servicios que ya existían y ya tenían permisos) y
`consultar_agenda` — esta última es la única de solo lectura
(`requiere_confirmacion=False`): enruta al chatbot existente
(`services/chatbot.py`) en vez de reinventar consultas propias, y
`/interpretar` devuelve la respuesta directa (tipo="respuesta") sin pasar
por el paso de confirmar.
"""
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.permissions import requerir_participacion_en_proyecto, requerir_rol_minimo
from app.models.entregable import Entregable
from app.models.equipo_miembro import EquipoMiembro
from app.models.minuta import AcuerdoMinuta, Minuta
from app.models.notificacion import Notificacion
from app.models.proyecto import Proyecto
from app.models.reunion import Reunion
from app.models.usuario import RolEnum, Usuario
from app.schemas.nota import NotaCrear
from app.services.asistente.resolucion import (
    OpcionResolucion,
    ResolucionResultado,
    resolver_acuerdo,
    resolver_campo,
    resolver_entregable,
    resolver_fecha,
    resolver_fecha_hora,
    resolver_miembro_mi_equipo,
    resolver_persona_en_equipo,
    resolver_persona_organizacion,
    resolver_personas_organizacion,
    resolver_proyecto,
    resolver_reunion,
    resolver_rol,
)
from app.services.chatbot import responder_pregunta
from app.services.entregables import (
    actualizar_avance,
    actualizar_entregable,
    crear_entregable,
    eliminar_entregable,
)
from app.services.equipos import (
    agregar_a_mi_equipo,
    aplicar_mi_equipo,
    quitar_de_mi_equipo,
    rol_default_para_nuevo_proyecto,
)
from app.services.minutas import (
    agregar_acuerdo,
    convertir_acuerdo_a_entregable,
    crear_o_actualizar_minuta,
    eliminar_acuerdo,
)
from app.services.notas import crear_nota
from app.services.proyectos import (
    actualizar_proyecto,
    asignar_rol_en_proyecto,
    crear_proyecto,
    eliminar_proyecto,
    listar_equipo_visible,
    listar_hijos_directos,
    mover_nodo,
    resumen_subarbol,
)
from app.services.reuniones import actualizar_reunion, crear_reunion, eliminar_reunion
from app.services.rol_labels import etiqueta_rol as _etiqueta_rol


@dataclass
class ResultadoInterpretacion:
    listo: bool
    parametros: Optional[dict] = None
    resumen: Optional[str] = None
    # Datos estructurados para que el frontend pinte una vista previa fiel
    # (tarjeta de entregable/proyecto/reunión/etc.) en vez de solo mostrar
    # `resumen` como texto — ver app/components/asistente/VistaPreviaAccion.jsx.
    # {"tipo": "entregable"|"proyecto"|"miembro"|"reunion"|"nota"|"acuerdo", ...}
    preview: Optional[dict] = None
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


# Los campos "rol" dentro de un `preview` estructurado se dejan como código
# crudo (N1-N4) a propósito -- el frontend ya los traduce con su propio
# etiquetaRol() (src/utils/rolLabels.js) al pintar la tarjeta, mismo patrón
# que el resto de la UI. Pero un `resumen`/`mensaje` es una ORACIÓN que se
# muestra Y se lee en voz alta -- ahí SÍ hace falta la palabra en español,
# igual que ya se hizo para el resto de los mensajes del asistente (ver
# CLAUDE.md, "Etiquetas N1-N4 también quitadas de mensajes generados por
# backend"). Vive en rol_labels.py (no aquí, ver import arriba) porque
# chatbot.py también lo necesita y este módulo ya importa de chatbot.py --
# un import al revés crearía un ciclo.


@dataclass
class ToolSpec:
    nombre: str
    descripcion: str
    parametros_llm: dict[str, str]
    ejemplos: list[tuple[str, dict]]
    resolver: Callable[[Session, Usuario, Optional[int], dict, dict], ResultadoInterpretacion]
    ejecutar: Callable[[Session, Usuario, dict], dict]
    # False solo para tools de solo lectura (ej. consultar_agenda): /interpretar
    # devuelve la respuesta directa (tipo="respuesta") sin pasar por el paso
    # de confirmar/ejecutar, porque no hay ninguna acción que confirmar.
    requiere_confirmacion: bool = True


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

    responsable_obj = db.query(Usuario).filter(Usuario.id == responsable_res.valor).first()

    parametros = {
        "proyecto_id": proyecto_id,
        "nombre": nombre,
        "descripcion": parametros_llm.get("descripcion") or None,
        "responsable_id": responsable_res.valor,
        "fecha_entrega": fecha_res.valor.isoformat(),
        "sensible": bool(parametros_llm.get("sensible") or False),
    }
    resumen = f'Voy a crear el entregable "{nombre}", con fecha límite {fecha_res.valor.isoformat()}. ¿Confirmas?'
    preview = {
        "tipo": "entregable",
        "nombre": nombre,
        "descripcion": parametros["descripcion"],
        "fecha_entrega": parametros["fecha_entrega"],
        "responsable_id": responsable_res.valor,
        "responsable_nombre": responsable_obj.nombre if responsable_obj else "?",
        "sensible": parametros["sensible"],
        "porcentaje_avance": 0,
    }
    return ResultadoInterpretacion(listo=True, parametros=parametros, resumen=resumen, preview=preview)


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

    preview = None
    entregable_actual = db.query(Entregable).filter(Entregable.id == entregable_res.valor).first()
    if entregable_actual:
        preview = {
            "tipo": "entregable",
            "nombre": entregable_actual.nombre,
            "descripcion": entregable_actual.descripcion,
            "fecha_entrega": entregable_actual.fecha_entrega.isoformat(),
            "responsable_id": entregable_actual.responsable_id,
            "responsable_nombre": entregable_actual.responsable.nombre if entregable_actual.responsable else "?",
            "sensible": entregable_actual.sensible,
            "porcentaje_avance": porcentaje,
        }
    return ResultadoInterpretacion(listo=True, parametros=parametros, resumen=resumen, preview=preview)


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
            listo=False, campo="nombre", pregunta="¿Cómo se llama el tema?", tipo_entrada="texto"
        )

    # tema_padre es OPCIONAL -- si no se menciona, es un proyecto/tema raíz
    # (comportamiento de siempre). Solo se resuelve si el LLM mandó texto o
    # si ya se está respondiendo una aclaración pendiente de este campo.
    texto_padre = parametros_llm.get("tema_padre") or ""
    if texto_padre.strip() or "tema_padre_id" in aclaraciones:
        padre_res = resolver_campo(
            "tema_padre_id", aclaraciones, texto_padre,
            lambda t: resolver_proyecto(db, usuario, t, None),
        )
        if not padre_res.resuelto:
            return _pendiente("tema_padre_id", padre_res)
        parent_id = padre_res.valor
        padre = db.query(Proyecto).filter(Proyecto.id == parent_id).first()
        parametros = {
            "nombre": nombre,
            "descripcion": parametros_llm.get("descripcion") or None,
            "parent_id": parent_id,
        }
        resumen = f'Voy a crear el subtema "{nombre}" dentro de "{padre.nombre if padre else "ese tema"}". ¿Confirmas?'
        preview = {
            "tipo": "proyecto",
            "nombre": nombre,
            "descripcion": parametros["descripcion"],
            "equipo": [],
        }
        return ResultadoInterpretacion(listo=True, parametros=parametros, resumen=resumen, preview=preview)

    parametros = {"nombre": nombre, "descripcion": parametros_llm.get("descripcion") or None, "parent_id": None}
    rol, dueno_id = rol_default_para_nuevo_proyecto(db, usuario)
    equipo = [{"usuario_id": usuario.id, "nombre": usuario.nombre, "rol": rol.value}]
    if rol == RolEnum.N1:
        resumen = f'Voy a crear el tema "{nombre}". Quedarás como {_etiqueta_rol(rol)}. ¿Confirmas?'
    else:
        dueno = db.query(Usuario).filter(Usuario.id == dueno_id).first() if dueno_id else None
        if dueno:
            rol_dueno = RolEnum.N1 if rol == RolEnum.N2 else RolEnum.N2
            equipo.append({"usuario_id": dueno.id, "nombre": dueno.nombre, "rol": rol_dueno.value})
            relacion = "dirección" if rol_dueno == RolEnum.N1 else "tu supervisor"
            resumen = (
                f'Voy a crear el tema "{nombre}". Quedarás como {_etiqueta_rol(rol)} y {dueno.nombre} '
                f"como {_etiqueta_rol(rol_dueno)} ({relacion}). ¿Confirmas?"
            )
        else:
            resumen = (
                f'Voy a crear el tema "{nombre}". Quedarás como {_etiqueta_rol(rol)} '
                "(según tu equipo guardado). ¿Confirmas?"
            )
    preview = {
        "tipo": "proyecto",
        "nombre": nombre,
        "descripcion": parametros["descripcion"],
        "equipo": equipo,
    }
    return ResultadoInterpretacion(listo=True, parametros=parametros, resumen=resumen, preview=preview)


def _ejecutar_crear_proyecto(db: Session, usuario: Usuario, parametros: dict) -> dict:
    nuevo = crear_proyecto(
        db, usuario, parametros["nombre"], parametros.get("descripcion"), parametros.get("parent_id")
    )
    db.commit()
    db.refresh(nuevo)
    return {
        "mensaje": f'Tema "{nuevo.nombre}" creado correctamente.',
        "resultado": {"id": nuevo.id, "nombre": nuevo.nombre},
    }


# --- agendar_reunion ------------------------------------------------------

_PALABRAS_REUNION_GENERAL = ("general", "sin proyecto", "sin tema", "ninguno", "ninguna")


def _es_reunion_general(texto: Optional[str]) -> bool:
    """"agenda una reunión general/sin proyecto/sin tema..." -- reunión no
    ligada a ningún tema (2026-08-16, ver Reunion.proyecto_id nullable)."""
    if not texto:
        return False
    normalizado = texto.strip().lower()
    return any(palabra in normalizado for palabra in _PALABRAS_REUNION_GENERAL)


def _resolver_agendar_reunion(
    db: Session, usuario: Usuario, proyecto_id_contexto: Optional[int], parametros_llm: dict, aclaraciones: dict
) -> ResultadoInterpretacion:
    texto_proyecto = parametros_llm.get("proyecto")
    aclaracion_proyecto = aclaraciones.get("proyecto_id")
    texto_para_general = aclaracion_proyecto if isinstance(aclaracion_proyecto, str) else texto_proyecto

    if not proyecto_id_contexto and _es_reunion_general(texto_para_general):
        proyecto_id = None
    else:
        proyecto_res = resolver_campo(
            "proyecto_id", aclaraciones, texto_proyecto,
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
        lambda t: resolver_personas_organizacion(db, usuario, t),
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
    participantes_nombres = (
        [u.nombre for u in db.query(Usuario).filter(Usuario.id.in_(participantes_res.valor)).all()]
        if participantes_res.valor else []
    )
    preview = {
        "tipo": "reunion",
        "titulo": titulo,
        "fecha_inicio": parametros["fecha_inicio"],
        "duracion_minutos": duracion,
        "organizador_nombre": usuario.nombre,
        "participantes": [{"nombre": n} for n in participantes_nombres],
    }
    return ResultadoInterpretacion(listo=True, parametros=parametros, resumen=resumen, preview=preview)


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

    def _resolver_persona_con_fallback_organizacion(texto: Optional[str]) -> ResolucionResultado:
        resultado_equipo = resolver_persona_en_equipo(db, usuario, proyecto_id, texto)
        if resultado_equipo.resuelto:
            return resultado_equipo
        # Si no había texto que resolver ("¿Para quién es?") o si sí se
        # encontraron candidatos ambiguos dentro del equipo (opciones para
        # desambiguar), no hay nada que "arreglar" buscando en otro lado —
        # solo se cae al caso "de verdad no está en el equipo" (tipo_entrada
        # texto, sin opciones), que es cuando vale la pena intentar org-wide.
        if not texto or resultado_equipo.opciones:
            return resultado_equipo
        # No está en el equipo visible del proyecto — puede que la persona
        # exista en la organización pero todavía no participe aquí (mismo
        # caso que agregar_miembro). Pedirle al usuario "repite el nombre
        # completo" nunca funciona si el nombre ya estaba bien dicho y lo
        # único que falta es agregarlo, así que se intenta la búsqueda
        # organización-wide antes de rendirse. Mismo gate de permisos que
        # agregar_miembro, para no exponer el directorio completo a quien
        # no puede agregar gente de todas formas.
        rol_actual = requerir_participacion_en_proyecto(db, usuario, proyecto_id)
        if rol_actual.rol not in (RolEnum.N1, RolEnum.N2):
            # No se revela si la persona existe o no en la organización —
            # mismo criterio de privacidad que agregar_miembro — pero el
            # mensaje debe ser honesto: el problema es de permiso, no de que
            # el nombre esté mal dicho (repetirlo no serviría de nada).
            return ResolucionResultado(
                resuelto=False,
                pregunta="Esa persona no está en el equipo de este tema, y solo dirección o líderes "
                "pueden agregar o reasignar gente aquí. Pide a alguien con ese rol que lo haga.",
                tipo_entrada="texto",
            )
        return resolver_persona_organizacion(db, texto, usuario)

    persona_res = resolver_campo(
        "usuario_id", aclaraciones, parametros_llm.get("persona"),
        _resolver_persona_con_fallback_organizacion,
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
    proyecto_obj = db.query(Proyecto).filter(Proyecto.id == proyecto_id).first()
    ya_en_equipo = any(m.usuario_id == persona_res.valor for m in listar_equipo_visible(db, usuario, proyecto_id))

    parametros = {
        "proyecto_id": proyecto_id,
        "usuario_id": persona_res.valor,
        "rol": rol_res.valor.value,
        "supervisor_id": supervisor_id,
    }
    verbo = "asignar" if ya_en_equipo else "agregar"
    resumen = f'Voy a {verbo} a {nombre_persona} como {_etiqueta_rol(rol_res.valor)} en este tema. ¿Confirmas?'
    preview = {
        "tipo": "miembro",
        "usuario_id": persona_res.valor,
        "nombre": nombre_persona,
        "puesto": persona.puesto if persona else None,
        "rol": rol_res.valor.value,
        "proyecto_nombre": proyecto_obj.nombre if proyecto_obj else "",
    }
    return ResultadoInterpretacion(listo=True, parametros=parametros, resumen=resumen, preview=preview)


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
        "mensaje": f"{resultado.nombre} quedó asignado como {_etiqueta_rol(resultado.rol)} en el tema.",
        "resultado": {"usuario_id": resultado.usuario_id, "rol": resultado.rol.value},
    }


# --- agregar_miembro ---------------------------------------------------------

def _resolver_agregar_miembro(
    db: Session, usuario: Usuario, proyecto_id_contexto: Optional[int], parametros_llm: dict, aclaraciones: dict
) -> ResultadoInterpretacion:
    proyecto_res = resolver_campo(
        "proyecto_id", aclaraciones, parametros_llm.get("proyecto"),
        lambda t: resolver_proyecto(db, usuario, t, proyecto_id_contexto),
    )
    if not proyecto_res.resuelto:
        return _pendiente("proyecto_id", proyecto_res)
    proyecto_id = proyecto_res.valor

    # Buscar en TODA la organización (no solo en el equipo del proyecto)
    # requiere ser N1/N2 de este proyecto — mismo permiso que ya exige
    # asignar_rol_en_proyecto al ejecutar, chequeado aquí antes para no
    # exponer el directorio completo a quien no tiene permisos aquí.
    rol_actual = requerir_participacion_en_proyecto(db, usuario, proyecto_id)
    requerir_rol_minimo(rol_actual, [RolEnum.N1, RolEnum.N2])

    persona_res = resolver_campo(
        "usuario_id", aclaraciones, parametros_llm.get("persona"),
        lambda t: resolver_persona_organizacion(db, t, usuario),
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
    proyecto_obj = db.query(Proyecto).filter(Proyecto.id == proyecto_id).first()

    parametros = {
        "proyecto_id": proyecto_id,
        "usuario_id": persona_res.valor,
        "rol": rol_res.valor.value,
        "supervisor_id": supervisor_id,
    }
    resumen = f'Voy a agregar a {nombre_persona} al tema como {_etiqueta_rol(rol_res.valor)}. ¿Confirmas?'
    preview = {
        "tipo": "miembro",
        "usuario_id": persona_res.valor,
        "nombre": nombre_persona,
        "puesto": persona.puesto if persona else None,
        "rol": rol_res.valor.value,
        "proyecto_nombre": proyecto_obj.nombre if proyecto_obj else "",
    }
    return ResultadoInterpretacion(listo=True, parametros=parametros, resumen=resumen, preview=preview)


def _ejecutar_agregar_miembro(db: Session, usuario: Usuario, parametros: dict) -> dict:
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
        "mensaje": f"{resultado.nombre} se agregó al tema como {_etiqueta_rol(resultado.rol)}.",
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
    reunion_obj = db.query(Reunion).filter(Reunion.id == reunion_res.valor).first()
    responsable_obj = db.query(Usuario).filter(Usuario.id == responsable_id).first() if responsable_id else None
    preview = {
        "tipo": "acuerdo",
        "descripcion": descripcion,
        "responsable_nombre": responsable_obj.nombre if responsable_obj else None,
        "reunion_titulo": reunion_obj.titulo if reunion_obj else "",
    }
    return ResultadoInterpretacion(listo=True, parametros=parametros, resumen=resumen, preview=preview)


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


# --- agregar_nota -----------------------------------------------------------

def _resolver_agregar_nota(
    db: Session, usuario: Usuario, proyecto_id_contexto: Optional[int], parametros_llm: dict, aclaraciones: dict
) -> ResultadoInterpretacion:
    proyecto_res = resolver_campo(
        "proyecto_id", aclaraciones, parametros_llm.get("proyecto"),
        lambda t: resolver_proyecto(db, usuario, t, proyecto_id_contexto),
    )
    if not proyecto_res.resuelto:
        return _pendiente("proyecto_id", proyecto_res)
    proyecto_id = proyecto_res.valor

    entregable_id = None
    reunion_id = None

    # Alcance de esta fase: nota sobre una reunión o un entregable
    # directamente (no sobre una minuta específica). Si el texto no dice
    # cuál de los dos, se pregunta y por default se intenta como reunión
    # primero (las notas de reunión son el caso más común pedido por Yue).
    if "entregable_id" in aclaraciones:
        entregable_res = resolver_campo(
            "entregable_id", aclaraciones, None, lambda t: resolver_entregable(db, usuario, proyecto_id, t),
        )
        if not entregable_res.resuelto:
            return _pendiente("entregable_id", entregable_res)
        entregable_id = entregable_res.valor
    elif "reunion_id" in aclaraciones:
        reunion_res = resolver_campo(
            "reunion_id", aclaraciones, None, lambda t: resolver_reunion(db, usuario, proyecto_id, t),
        )
        if not reunion_res.resuelto:
            return _pendiente("reunion_id", reunion_res)
        reunion_id = reunion_res.valor
    elif parametros_llm.get("entregable"):
        entregable_res = resolver_entregable(db, usuario, proyecto_id, parametros_llm["entregable"])
        if not entregable_res.resuelto:
            return _pendiente("entregable_id", entregable_res)
        entregable_id = entregable_res.valor
    elif parametros_llm.get("reunion"):
        reunion_res = resolver_reunion(db, usuario, proyecto_id, parametros_llm["reunion"])
        if not reunion_res.resuelto:
            return _pendiente("reunion_id", reunion_res)
        reunion_id = reunion_res.valor
    else:
        return ResultadoInterpretacion(
            listo=False, campo="reunion_id",
            pregunta="¿La nota es sobre qué reunión o entregable? Dime el nombre.",
            tipo_entrada="texto",
        )

    contenido = (
        aclaraciones.get("contenido") if isinstance(aclaraciones.get("contenido"), str) else parametros_llm.get("contenido")
    )
    contenido = (contenido or "").strip()
    if not contenido:
        return ResultadoInterpretacion(
            listo=False, campo="contenido", pregunta="¿Qué dice la nota?", tipo_entrada="texto"
        )

    parametros = {"entregable_id": entregable_id, "reunion_id": reunion_id, "contenido": contenido}
    destino = "el entregable" if entregable_id else "la reunión"
    resumen = f'Voy a agregar esta nota a {destino}: "{contenido}". ¿Confirmas?'

    destino_nombre = None
    if entregable_id:
        e = db.query(Entregable).filter(Entregable.id == entregable_id).first()
        destino_nombre = e.nombre if e else None
    elif reunion_id:
        r = db.query(Reunion).filter(Reunion.id == reunion_id).first()
        destino_nombre = r.titulo if r else None
    preview = {
        "tipo": "nota",
        "contenido": contenido,
        "autor_nombre": usuario.nombre,
        "destino": destino_nombre,
    }
    return ResultadoInterpretacion(listo=True, parametros=parametros, resumen=resumen, preview=preview)


def _ejecutar_agregar_nota(db: Session, usuario: Usuario, parametros: dict) -> dict:
    nota = crear_nota(
        db,
        usuario,
        NotaCrear(
            contenido=parametros["contenido"],
            entregable_id=parametros.get("entregable_id"),
            reunion_id=parametros.get("reunion_id"),
            minuta_id=None,
        ),
    )
    db.commit()
    db.refresh(nota)
    return {"mensaje": "Nota agregada correctamente.", "resultado": {"id": nota.id}}


# --- editar_reunion -----------------------------------------------------------

def _resolver_editar_reunion(
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
    reunion_id = reunion_res.valor
    reunion_actual = db.query(Reunion).filter(Reunion.id == reunion_id).first()

    campos: dict = {}
    resumen_partes: list[str] = []

    titulo_nuevo = (parametros_llm.get("titulo_nuevo") or "").strip()
    if titulo_nuevo:
        campos["titulo"] = titulo_nuevo
        resumen_partes.append(f'título a "{titulo_nuevo}"')

    if parametros_llm.get("fecha_inicio") or "fecha_inicio" in aclaraciones:
        fecha_res = resolver_campo(
            "fecha_inicio", aclaraciones, parametros_llm.get("fecha_inicio"), resolver_fecha_hora,
        )
        if not fecha_res.resuelto:
            return _pendiente("fecha_inicio", fecha_res)
        campos["fecha_inicio"] = fecha_res.valor.isoformat()
        resumen_partes.append(f'fecha al {fecha_res.valor.strftime("%d/%m/%Y a las %H:%M")}')

    duracion_bruta = parametros_llm.get("duracion_minutos")
    if duracion_bruta:
        try:
            campos["duracion_minutos"] = int(duracion_bruta)
            resumen_partes.append(f"duración a {campos['duracion_minutos']} minutos")
        except (TypeError, ValueError):
            pass

    if parametros_llm.get("participantes") or "participantes_ids" in aclaraciones:
        participantes_res = resolver_campo(
            "participantes_ids", aclaraciones, parametros_llm.get("participantes"),
            lambda t: resolver_personas_organizacion(db, usuario, t),
        )
        if not participantes_res.resuelto:
            return _pendiente("participantes_ids", participantes_res)
        # Se AGREGAN a los que ya estaban invitados, nunca se reemplaza la
        # lista completa a ciegas — decir "agrega a Lucía" no debe borrar al
        # resto de invitados que el usuario no volvió a mencionar.
        ids_actuales = {p.usuario_id for p in reunion_actual.participantes} if reunion_actual else set()
        ids_nuevos = set(participantes_res.valor) - ids_actuales
        if ids_nuevos:
            campos["participantes_ids"] = list(ids_actuales | ids_nuevos)
            nombres_nuevos = [u.nombre for u in db.query(Usuario).filter(Usuario.id.in_(ids_nuevos)).all()]
            resumen_partes.append(f"agregar a {', '.join(nombres_nuevos)} como participante(s)")
        else:
            # El texto mencionaba a alguien pero no resultó en ningún
            # participante nuevo (ya estaba invitado, o no se identificó a
            # nadie) — mejor preguntar que confirmar a ciegas un cambio que
            # en realidad no hace nada.
            return ResultadoInterpretacion(
                listo=False, campo="participantes_ids",
                pregunta=f'No encontré a nadie nuevo que agregar a partir de "{parametros_llm.get("participantes")}" '
                "(puede que ya esté invitado, o que no lo haya identificado bien). ¿Puedes decir el nombre completo?",
                tipo_entrada="texto",
            )

    if not campos:
        return ResultadoInterpretacion(
            listo=False, campo="titulo_nuevo",
            pregunta="¿Qué quieres cambiar de la reunión? (fecha/hora, título, participantes)",
            tipo_entrada="texto",
        )

    parametros = {"reunion_id": reunion_id, "campos": campos}
    resumen = f"Voy a actualizar {', '.join(resumen_partes)} de la reunión. ¿Confirmas?"

    participantes_ids_final = campos.get(
        "participantes_ids",
        [p.usuario_id for p in reunion_actual.participantes] if reunion_actual else [],
    )
    participantes_nombres = [
        u.nombre for u in db.query(Usuario).filter(Usuario.id.in_(participantes_ids_final)).all()
    ]
    preview = {
        "tipo": "reunion",
        "titulo": campos.get("titulo", reunion_actual.titulo if reunion_actual else titulo_nuevo),
        "fecha_inicio": campos.get(
            "fecha_inicio", reunion_actual.fecha_inicio.isoformat() if reunion_actual else None
        ),
        "duracion_minutos": campos.get(
            "duracion_minutos", reunion_actual.duracion_minutos if reunion_actual else None
        ),
        "organizador_nombre": (
            reunion_actual.organizador.nombre if reunion_actual and reunion_actual.organizador else usuario.nombre
        ),
        "participantes": [{"nombre": n} for n in participantes_nombres],
    }
    return ResultadoInterpretacion(listo=True, parametros=parametros, resumen=resumen, preview=preview)


def _ejecutar_editar_reunion(db: Session, usuario: Usuario, parametros: dict) -> dict:
    from datetime import datetime

    campos = dict(parametros["campos"])
    if "fecha_inicio" in campos:
        campos["fecha_inicio"] = datetime.fromisoformat(campos["fecha_inicio"])

    reunion = actualizar_reunion(db, usuario, parametros["reunion_id"], campos)
    db.commit()
    db.refresh(reunion)
    return {"mensaje": f'Reunión "{reunion.titulo}" actualizada correctamente.', "resultado": {"id": reunion.id}}


# --- editar_entregable -----------------------------------------------------------

def _resolver_editar_entregable(
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
    entregable_id = entregable_res.valor
    entregable_actual = db.query(Entregable).filter(Entregable.id == entregable_id).first()

    campos: dict = {}
    resumen_partes: list[str] = []

    nombre_nuevo = (parametros_llm.get("nombre_nuevo") or "").strip()
    if nombre_nuevo:
        campos["nombre"] = nombre_nuevo
        resumen_partes.append(f'nombre a "{nombre_nuevo}"')

    descripcion_nueva = parametros_llm.get("descripcion_nueva")
    if descripcion_nueva:
        campos["descripcion"] = descripcion_nueva
        resumen_partes.append("la descripción")

    if parametros_llm.get("fecha_entrega") or "fecha_entrega" in aclaraciones:
        fecha_res = resolver_campo(
            "fecha_entrega", aclaraciones, parametros_llm.get("fecha_entrega"), resolver_fecha,
        )
        if not fecha_res.resuelto:
            return _pendiente("fecha_entrega", fecha_res)
        campos["fecha_entrega"] = fecha_res.valor.isoformat()
        resumen_partes.append(f"fecha límite al {fecha_res.valor.isoformat()}")

    if parametros_llm.get("responsable_nuevo") or "responsable_id" in aclaraciones:
        responsable_res = resolver_campo(
            "responsable_id", aclaraciones, parametros_llm.get("responsable_nuevo"),
            lambda t: resolver_persona_en_equipo(db, usuario, proyecto_id, t),
        )
        if not responsable_res.resuelto:
            return _pendiente("responsable_id", responsable_res)
        campos["responsable_id"] = responsable_res.valor
        resumen_partes.append("el responsable")

    if not campos:
        return ResultadoInterpretacion(
            listo=False, campo="nombre_nuevo",
            pregunta="¿Qué quieres cambiar del entregable? (nombre, descripción, fecha límite, responsable)",
            tipo_entrada="texto",
        )

    parametros = {"entregable_id": entregable_id, "campos": campos}
    resumen = f"Voy a actualizar {', '.join(resumen_partes)} del entregable. ¿Confirmas?"

    responsable_id_final = campos.get(
        "responsable_id", entregable_actual.responsable_id if entregable_actual else None
    )
    responsable_obj = (
        db.query(Usuario).filter(Usuario.id == responsable_id_final).first() if responsable_id_final else None
    )
    preview = {
        "tipo": "entregable",
        "nombre": campos.get("nombre", entregable_actual.nombre if entregable_actual else nombre_nuevo),
        "descripcion": campos.get(
            "descripcion", entregable_actual.descripcion if entregable_actual else None
        ),
        "fecha_entrega": campos.get(
            "fecha_entrega", entregable_actual.fecha_entrega.isoformat() if entregable_actual else None
        ),
        "responsable_id": responsable_id_final,
        "responsable_nombre": responsable_obj.nombre if responsable_obj else None,
        "sensible": entregable_actual.sensible if entregable_actual else False,
        "porcentaje_avance": entregable_actual.porcentaje_avance if entregable_actual else 0,
    }
    return ResultadoInterpretacion(listo=True, parametros=parametros, resumen=resumen, preview=preview)


def _ejecutar_editar_entregable(db: Session, usuario: Usuario, parametros: dict) -> dict:
    from datetime import date

    campos = dict(parametros["campos"])
    if "fecha_entrega" in campos:
        campos["fecha_entrega"] = date.fromisoformat(campos["fecha_entrega"])

    entregable = actualizar_entregable(db, usuario, parametros["entregable_id"], campos)
    db.commit()
    db.refresh(entregable)
    return {
        "mensaje": f'Entregable "{entregable.nombre}" actualizado correctamente.',
        "resultado": {"id": entregable.id},
    }


# --- editar_proyecto -----------------------------------------------------------

def _resolver_editar_proyecto(
    db: Session, usuario: Usuario, proyecto_id_contexto: Optional[int], parametros_llm: dict, aclaraciones: dict
) -> ResultadoInterpretacion:
    proyecto_res = resolver_campo(
        "proyecto_id", aclaraciones, parametros_llm.get("proyecto"),
        lambda t: resolver_proyecto(db, usuario, t, proyecto_id_contexto),
    )
    if not proyecto_res.resuelto:
        return _pendiente("proyecto_id", proyecto_res)
    proyecto_id = proyecto_res.valor
    proyecto_actual = db.query(Proyecto).filter(Proyecto.id == proyecto_id).first()

    campos: dict = {}
    resumen_partes: list[str] = []

    nombre_nuevo = (parametros_llm.get("nombre_nuevo") or "").strip()
    if nombre_nuevo:
        campos["nombre"] = nombre_nuevo
        resumen_partes.append(f'nombre a "{nombre_nuevo}"')

    descripcion_nueva = parametros_llm.get("descripcion_nueva")
    if descripcion_nueva:
        campos["descripcion"] = descripcion_nueva
        resumen_partes.append("la descripción")

    if not campos:
        return ResultadoInterpretacion(
            listo=False, campo="nombre_nuevo",
            pregunta="¿Qué quieres cambiar del tema: el nombre o la descripción?",
            tipo_entrada="texto",
        )

    parametros = {"proyecto_id": proyecto_id, "campos": campos}
    resumen = f"Voy a actualizar {', '.join(resumen_partes)} del tema. ¿Confirmas?"
    preview = {
        "tipo": "proyecto",
        "nombre": campos.get("nombre", proyecto_actual.nombre if proyecto_actual else nombre_nuevo),
        "descripcion": campos.get(
            "descripcion", proyecto_actual.descripcion if proyecto_actual else None
        ),
        "equipo": [],
    }
    return ResultadoInterpretacion(listo=True, parametros=parametros, resumen=resumen, preview=preview)


def _ejecutar_editar_proyecto(db: Session, usuario: Usuario, parametros: dict) -> dict:
    proyecto = actualizar_proyecto(db, usuario, parametros["proyecto_id"], parametros["campos"])
    db.commit()
    db.refresh(proyecto)
    return {"mensaje": f'Tema "{proyecto.nombre}" actualizado correctamente.', "resultado": {"id": proyecto.id}}


# --- leer_notificaciones (solo lectura, sin confirmación) ------------------

def _resolver_leer_notificaciones(
    db: Session, usuario: Usuario, proyecto_id_contexto: Optional[int], parametros_llm: dict, aclaraciones: dict
) -> ResultadoInterpretacion:
    solo_no_leidas = str(parametros_llm.get("filtro") or "no_leidas").strip().lower() != "todas"

    query = db.query(Notificacion).filter(Notificacion.usuario_id == usuario.id)
    if solo_no_leidas:
        query = query.filter(Notificacion.leida.is_(False))
    notificaciones = query.order_by(Notificacion.fecha_creacion.desc()).limit(10).all()

    if not notificaciones:
        texto = "No tienes notificaciones sin leer." if solo_no_leidas else "No tienes ninguna notificación."
    else:
        lineas = [f"{i + 1}. {n.mensaje}" for i, n in enumerate(notificaciones)]
        texto = f"Tienes {len(notificaciones)} notificación(es):\n" + "\n".join(lineas)

    return ResultadoInterpretacion(listo=True, parametros={}, resumen=texto)


def _ejecutar_leer_notificaciones(db: Session, usuario: Usuario, parametros: dict) -> dict:
    # No debería llamarse nunca: requiere_confirmacion=False, ver consultar_agenda.
    return {"mensaje": "", "resultado": None}


# --- eliminar_entregable -----------------------------------------------------

def _resolver_eliminar_entregable(
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

    entregable_actual = db.query(Entregable).filter(Entregable.id == entregable_res.valor).first()
    nombre = entregable_actual.nombre if entregable_actual else "ese entregable"

    parametros = {"entregable_id": entregable_res.valor}
    resumen = f'Voy a ELIMINAR el entregable "{nombre}". Esta acción no se puede deshacer. ¿Confirmas?'
    preview = None
    if entregable_actual:
        preview = {
            "tipo": "entregable",
            "nombre": entregable_actual.nombre,
            "descripcion": entregable_actual.descripcion,
            "fecha_entrega": entregable_actual.fecha_entrega.isoformat(),
            "responsable_id": entregable_actual.responsable_id,
            "responsable_nombre": entregable_actual.responsable.nombre if entregable_actual.responsable else "?",
            "sensible": entregable_actual.sensible,
            "porcentaje_avance": entregable_actual.porcentaje_avance,
        }
    return ResultadoInterpretacion(listo=True, parametros=parametros, resumen=resumen, preview=preview)


def _ejecutar_eliminar_entregable(db: Session, usuario: Usuario, parametros: dict) -> dict:
    eliminar_entregable(db, usuario, parametros["entregable_id"])
    db.commit()
    return {"mensaje": "Entregable eliminado correctamente.", "resultado": None}


# --- eliminar_proyecto ---------------------------------------------------------

def _resolver_eliminar_proyecto(
    db: Session, usuario: Usuario, proyecto_id_contexto: Optional[int], parametros_llm: dict, aclaraciones: dict
) -> ResultadoInterpretacion:
    proyecto_res = resolver_campo(
        "proyecto_id", aclaraciones, parametros_llm.get("proyecto"),
        lambda t: resolver_proyecto(db, usuario, t, proyecto_id_contexto),
    )
    if not proyecto_res.resuelto:
        return _pendiente("proyecto_id", proyecto_res)

    proyecto_actual = db.query(Proyecto).filter(Proyecto.id == proyecto_res.valor).first()
    nombre = proyecto_actual.nombre if proyecto_actual else "ese tema"

    parametros = {"proyecto_id": proyecto_res.valor}
    aviso_subtemas = ""
    resumen_arbol = resumen_subarbol(db, usuario, proyecto_res.valor)
    if resumen_arbol["total_subtemas"] > 0:
        aviso_subtemas = (
            f' Esto incluye {resumen_arbol["total_subtemas"]} subtema(s) y todo su contenido.'
        )
    resumen = (
        f'Voy a ELIMINAR el tema "{nombre}" y TODO lo que tiene (entregables, reuniones, '
        f"minutas, equipo).{aviso_subtemas} Esta acción no se puede deshacer. ¿Confirmas?"
    )
    preview = {
        "tipo": "proyecto",
        "nombre": nombre,
        "descripcion": proyecto_actual.descripcion if proyecto_actual else None,
        "equipo": [],
    }
    return ResultadoInterpretacion(listo=True, parametros=parametros, resumen=resumen, preview=preview)


def _ejecutar_eliminar_proyecto(db: Session, usuario: Usuario, parametros: dict) -> dict:
    eliminar_proyecto(db, usuario, parametros["proyecto_id"])
    db.commit()
    return {"mensaje": "Tema eliminado correctamente.", "resultado": None}


# --- listar_subtemas (solo lectura, sin confirmación) ----------------------

def _resolver_listar_subtemas(
    db: Session, usuario: Usuario, proyecto_id_contexto: Optional[int], parametros_llm: dict, aclaraciones: dict
) -> ResultadoInterpretacion:
    proyecto_res = resolver_campo(
        "proyecto_id", aclaraciones, parametros_llm.get("proyecto"),
        lambda t: resolver_proyecto(db, usuario, t, proyecto_id_contexto),
    )
    if not proyecto_res.resuelto:
        return _pendiente("proyecto_id", proyecto_res)

    proyecto = db.query(Proyecto).filter(Proyecto.id == proyecto_res.valor).first()
    nombre = proyecto.nombre if proyecto else "ese tema"
    hijos = listar_hijos_directos(db, usuario, proyecto_res.valor)

    if not hijos:
        texto = f'"{nombre}" no tiene subtemas todavía.'
    else:
        lineas = [f"{i + 1}. {h.nombre}" for i, h in enumerate(hijos)]
        texto = f'"{nombre}" tiene {len(hijos)} subtema(s):\n' + "\n".join(lineas)

    return ResultadoInterpretacion(listo=True, parametros={}, resumen=texto)


def _ejecutar_listar_subtemas(db: Session, usuario: Usuario, parametros: dict) -> dict:
    # No debería llamarse nunca: requiere_confirmacion=False, ver leer_notificaciones.
    return {"mensaje": "", "resultado": None}


# --- mover_tema --------------------------------------------------------------

def _resolver_mover_tema(
    db: Session, usuario: Usuario, proyecto_id_contexto: Optional[int], parametros_llm: dict, aclaraciones: dict
) -> ResultadoInterpretacion:
    tema_res = resolver_campo(
        "tema_id", aclaraciones, parametros_llm.get("tema"),
        lambda t: resolver_proyecto(db, usuario, t, proyecto_id_contexto),
    )
    if not tema_res.resuelto:
        return _pendiente("tema_id", tema_res)

    destino_res = resolver_campo(
        "nuevo_padre_id", aclaraciones, parametros_llm.get("nuevo_tema_padre"),
        lambda t: resolver_proyecto(db, usuario, t, None),
    )
    if not destino_res.resuelto:
        return _pendiente("nuevo_padre_id", destino_res)

    tema = db.query(Proyecto).filter(Proyecto.id == tema_res.valor).first()
    destino = db.query(Proyecto).filter(Proyecto.id == destino_res.valor).first()
    parametros = {"proyecto_id": tema_res.valor, "nuevo_parent_id": destino_res.valor}
    resumen = (
        f'Voy a mover "{tema.nombre if tema else "ese tema"}" dentro de '
        f'"{destino.nombre if destino else "ese otro tema"}". ¿Confirmas?'
    )
    return ResultadoInterpretacion(listo=True, parametros=parametros, resumen=resumen)


def _ejecutar_mover_tema(db: Session, usuario: Usuario, parametros: dict) -> dict:
    proyecto = mover_nodo(db, usuario, parametros["proyecto_id"], parametros["nuevo_parent_id"])
    db.commit()
    return {"mensaje": f'"{proyecto.nombre}" se movió correctamente.', "resultado": {"id": proyecto.id}}


# --- eliminar_reunion -----------------------------------------------------------

def _resolver_eliminar_reunion(
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

    reunion_actual = db.query(Reunion).filter(Reunion.id == reunion_res.valor).first()
    titulo = reunion_actual.titulo if reunion_actual else "esa reunión"

    parametros = {"reunion_id": reunion_res.valor}
    resumen = f'Voy a ELIMINAR la reunión "{titulo}". Esta acción no se puede deshacer. ¿Confirmas?'
    preview = None
    if reunion_actual:
        participantes_nombres = [
            u.nombre for u in db.query(Usuario)
            .filter(Usuario.id.in_([p.usuario_id for p in reunion_actual.participantes]))
            .all()
        ]
        preview = {
            "tipo": "reunion",
            "titulo": reunion_actual.titulo,
            "fecha_inicio": reunion_actual.fecha_inicio.isoformat(),
            "duracion_minutos": reunion_actual.duracion_minutos,
            "organizador_nombre": reunion_actual.organizador.nombre if reunion_actual.organizador else "?",
            "participantes": [{"nombre": n} for n in participantes_nombres],
        }
    return ResultadoInterpretacion(listo=True, parametros=parametros, resumen=resumen, preview=preview)


def _ejecutar_eliminar_reunion(db: Session, usuario: Usuario, parametros: dict) -> dict:
    eliminar_reunion(db, usuario, parametros["reunion_id"])
    db.commit()
    return {"mensaje": "Reunión eliminada correctamente.", "resultado": None}


# --- eliminar_acuerdo -----------------------------------------------------------

def _resolver_eliminar_acuerdo(
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
    reunion_id = reunion_res.valor

    acuerdo_res = resolver_campo(
        "acuerdo_id", aclaraciones, parametros_llm.get("acuerdo"),
        lambda t: resolver_acuerdo(db, usuario, reunion_id, t),
    )
    if not acuerdo_res.resuelto:
        return _pendiente("acuerdo_id", acuerdo_res)

    acuerdo_actual = db.query(AcuerdoMinuta).filter(AcuerdoMinuta.id == acuerdo_res.valor).first()
    reunion_actual = db.query(Reunion).filter(Reunion.id == reunion_id).first()
    descripcion = acuerdo_actual.descripcion if acuerdo_actual else "ese acuerdo"

    parametros = {"acuerdo_id": acuerdo_res.valor}
    resumen = f'Voy a ELIMINAR el acuerdo "{descripcion}" de la minuta. Esta acción no se puede deshacer. ¿Confirmas?'
    preview = {
        "tipo": "acuerdo",
        "descripcion": descripcion,
        "responsable_nombre": (
            acuerdo_actual.responsable.nombre if acuerdo_actual and acuerdo_actual.responsable else None
        ),
        "reunion_titulo": reunion_actual.titulo if reunion_actual else "",
    }
    return ResultadoInterpretacion(listo=True, parametros=parametros, resumen=resumen, preview=preview)


def _ejecutar_eliminar_acuerdo(db: Session, usuario: Usuario, parametros: dict) -> dict:
    eliminar_acuerdo(db, usuario, parametros["acuerdo_id"])
    db.commit()
    return {"mensaje": "Acuerdo eliminado correctamente.", "resultado": None}


# --- convertir_acuerdo_a_entregable ---------------------------------------------

def _resolver_convertir_acuerdo(
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
    reunion_id = reunion_res.valor

    acuerdo_res = resolver_campo(
        "acuerdo_id", aclaraciones, parametros_llm.get("acuerdo"),
        lambda t: resolver_acuerdo(db, usuario, reunion_id, t),
    )
    if not acuerdo_res.resuelto:
        return _pendiente("acuerdo_id", acuerdo_res)
    acuerdo_id = acuerdo_res.valor
    acuerdo_actual = db.query(AcuerdoMinuta).filter(AcuerdoMinuta.id == acuerdo_id).first()

    if acuerdo_actual and acuerdo_actual.convertido:
        return ResultadoInterpretacion(
            listo=False, campo="acuerdo_id",
            pregunta="Ese acuerdo ya fue convertido en entregable antes. ¿Te refieres a otro acuerdo?",
            tipo_entrada="texto",
        )

    # El servicio exige que el acuerdo YA tenga responsable_id -- si no lo
    # tiene, se resuelve aquí (nunca se escribe en la BD todavía: eso
    # pasa recién en _ejecutar_convertir_acuerdo, tras la confirmación).
    responsable_id_nuevo = None
    responsable_id_final = acuerdo_actual.responsable_id if acuerdo_actual else None
    if not responsable_id_final:
        responsable_res = resolver_campo(
            "responsable_id", aclaraciones, parametros_llm.get("responsable"),
            lambda t: resolver_persona_en_equipo(db, usuario, proyecto_id, t),
        )
        if not responsable_res.resuelto:
            return _pendiente("responsable_id", responsable_res)
        responsable_id_nuevo = responsable_res.valor
        responsable_id_final = responsable_res.valor

    fecha_res = resolver_campo(
        "fecha_entrega", aclaraciones, parametros_llm.get("fecha_entrega"), resolver_fecha,
    )
    if not fecha_res.resuelto:
        return _pendiente("fecha_entrega", fecha_res)

    parametros = {
        "acuerdo_id": acuerdo_id,
        "responsable_id_nuevo": responsable_id_nuevo,
        "fecha_entrega": fecha_res.valor.isoformat(),
        "sensible": bool(parametros_llm.get("sensible") or False),
    }
    resumen = (
        f'Voy a convertir el acuerdo "{acuerdo_actual.descripcion if acuerdo_actual else ""}" '
        f"en un entregable, con fecha límite {fecha_res.valor.isoformat()}. ¿Confirmas?"
    )
    responsable_obj = (
        db.query(Usuario).filter(Usuario.id == responsable_id_final).first() if responsable_id_final else None
    )
    preview = {
        "tipo": "entregable",
        "nombre": acuerdo_actual.descripcion if acuerdo_actual else "",
        "descripcion": None,
        "fecha_entrega": parametros["fecha_entrega"],
        "responsable_id": responsable_id_final,
        "responsable_nombre": responsable_obj.nombre if responsable_obj else "?",
        "sensible": parametros["sensible"],
        "porcentaje_avance": 0,
    }
    return ResultadoInterpretacion(listo=True, parametros=parametros, resumen=resumen, preview=preview)


def _ejecutar_convertir_acuerdo(db: Session, usuario: Usuario, parametros: dict) -> dict:
    from datetime import date

    if parametros.get("responsable_id_nuevo"):
        acuerdo = db.query(AcuerdoMinuta).filter(AcuerdoMinuta.id == parametros["acuerdo_id"]).first()
        if acuerdo and not acuerdo.responsable_id:
            acuerdo.responsable_id = parametros["responsable_id_nuevo"]

    acuerdo = convertir_acuerdo_a_entregable(
        db, usuario, parametros["acuerdo_id"],
        date.fromisoformat(parametros["fecha_entrega"]), parametros.get("sensible", False),
    )
    db.commit()
    return {
        "mensaje": f'Acuerdo convertido en entregable: "{acuerdo.descripcion}".',
        "resultado": {"id": acuerdo.entregable_id},
    }


# --- agregar_a_mi_equipo (plantilla personal) -----------------------------------

def _resolver_agregar_a_mi_equipo(
    db: Session, usuario: Usuario, proyecto_id_contexto: Optional[int], parametros_llm: dict, aclaraciones: dict
) -> ResultadoInterpretacion:
    persona_res = resolver_campo(
        "usuario_id", aclaraciones, parametros_llm.get("persona"),
        lambda t: resolver_persona_organizacion(db, t, usuario),
    )
    if not persona_res.resuelto:
        return _pendiente("usuario_id", persona_res)

    rol_res = resolver_campo("rol", aclaraciones, parametros_llm.get("rol"), resolver_rol)
    if not rol_res.resuelto:
        return _pendiente("rol", rol_res)

    persona = db.query(Usuario).filter(Usuario.id == persona_res.valor).first()
    nombre_persona = persona.nombre if persona else "esa persona"

    parametros = {"usuario_id": persona_res.valor, "rol": rol_res.valor.value}
    resumen = f'Voy a guardar a {nombre_persona} en tu equipo, como {_etiqueta_rol(rol_res.valor)}. ¿Confirmas?'
    preview = {
        "tipo": "miembro",
        "usuario_id": persona_res.valor,
        "nombre": nombre_persona,
        "puesto": persona.puesto if persona else None,
        "rol": rol_res.valor.value,
        "proyecto_nombre": "Mi equipo (plantilla personal)",
    }
    return ResultadoInterpretacion(listo=True, parametros=parametros, resumen=resumen, preview=preview)


def _ejecutar_agregar_a_mi_equipo(db: Session, usuario: Usuario, parametros: dict) -> dict:
    registro = agregar_a_mi_equipo(db, usuario, parametros["usuario_id"], RolEnum(parametros["rol"]))
    db.commit()
    db.refresh(registro)
    return {
        "mensaje": f"{registro.usuario.nombre} se guardó en tu equipo como {_etiqueta_rol(registro.rol)}.",
        "resultado": {"usuario_id": registro.usuario_id, "rol": registro.rol.value},
    }


# --- quitar_de_mi_equipo (plantilla personal) -----------------------------------

def _resolver_quitar_de_mi_equipo(
    db: Session, usuario: Usuario, proyecto_id_contexto: Optional[int], parametros_llm: dict, aclaraciones: dict
) -> ResultadoInterpretacion:
    persona_res = resolver_campo(
        "usuario_id", aclaraciones, parametros_llm.get("persona"),
        lambda t: resolver_miembro_mi_equipo(db, usuario, t),
    )
    if not persona_res.resuelto:
        return _pendiente("usuario_id", persona_res)

    persona = db.query(Usuario).filter(Usuario.id == persona_res.valor).first()
    nombre_persona = persona.nombre if persona else "esa persona"
    registro_actual = (
        db.query(EquipoMiembro)
        .filter(EquipoMiembro.propietario_id == usuario.id, EquipoMiembro.usuario_id == persona_res.valor)
        .first()
    )

    parametros = {"usuario_id": persona_res.valor}
    resumen = f'Voy a quitar a {nombre_persona} de tu equipo guardado. ¿Confirmas?'
    preview = {
        "tipo": "miembro",
        "usuario_id": persona_res.valor,
        "nombre": nombre_persona,
        "puesto": persona.puesto if persona else None,
        "rol": registro_actual.rol.value if registro_actual else None,
        "proyecto_nombre": "Mi equipo (plantilla personal)",
    }
    return ResultadoInterpretacion(listo=True, parametros=parametros, resumen=resumen, preview=preview)


def _ejecutar_quitar_de_mi_equipo(db: Session, usuario: Usuario, parametros: dict) -> dict:
    quitar_de_mi_equipo(db, usuario, parametros["usuario_id"])
    db.commit()
    return {"mensaje": "Se quitó de tu equipo guardado.", "resultado": None}


# --- aplicar_mi_equipo (plantilla personal) -------------------------------------

def _resolver_aplicar_mi_equipo(
    db: Session, usuario: Usuario, proyecto_id_contexto: Optional[int], parametros_llm: dict, aclaraciones: dict
) -> ResultadoInterpretacion:
    proyecto_res = resolver_campo(
        "proyecto_id", aclaraciones, parametros_llm.get("proyecto"),
        lambda t: resolver_proyecto(db, usuario, t, proyecto_id_contexto),
    )
    if not proyecto_res.resuelto:
        return _pendiente("proyecto_id", proyecto_res)
    proyecto_id = proyecto_res.valor

    proyecto_actual = db.query(Proyecto).filter(Proyecto.id == proyecto_id).first()
    plantilla = db.query(EquipoMiembro).filter(EquipoMiembro.propietario_id == usuario.id).all()
    if not plantilla:
        return ResultadoInterpretacion(
            listo=False, campo="proyecto_id",
            pregunta="Tu equipo guardado está vacío, no hay a quién aplicar. Primero guarda gente en tu equipo.",
            tipo_entrada="texto",
        )

    nombres = [m.usuario.nombre for m in plantilla]
    parametros = {"proyecto_id": proyecto_id}
    resumen = (
        f'Voy a aplicar tu equipo guardado ({", ".join(nombres)}) al tema '
        f'"{proyecto_actual.nombre if proyecto_actual else ""}". ¿Confirmas?'
    )
    preview = {
        "tipo": "proyecto",
        "nombre": proyecto_actual.nombre if proyecto_actual else "",
        "descripcion": proyecto_actual.descripcion if proyecto_actual else None,
        "equipo": [
            {"usuario_id": m.usuario_id, "nombre": m.usuario.nombre, "rol": m.rol.value} for m in plantilla
        ],
    }
    return ResultadoInterpretacion(listo=True, parametros=parametros, resumen=resumen, preview=preview)


def _ejecutar_aplicar_mi_equipo(db: Session, usuario: Usuario, parametros: dict) -> dict:
    resultado = aplicar_mi_equipo(db, usuario, parametros["proyecto_id"])
    db.commit()
    return {
        "mensaje": f"Se aplicó tu equipo guardado al tema ({len(resultado)} persona(s)).",
        "resultado": {"cantidad": len(resultado)},
    }


# --- consultar_agenda (solo lectura, sin confirmación) -----------------------

def _resolver_consultar_agenda(
    db: Session, usuario: Usuario, proyecto_id_contexto: Optional[int], parametros_llm: dict, aclaraciones: dict
) -> ResultadoInterpretacion:
    pregunta = (parametros_llm.get("pregunta") or "").strip()
    if not pregunta:
        return ResultadoInterpretacion(
            listo=False, campo="pregunta", pregunta="¿Qué quieres saber?", tipo_entrada="texto"
        )
    try:
        respuesta = responder_pregunta(db, usuario, pregunta)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return ResultadoInterpretacion(listo=True, parametros={}, resumen=respuesta)


def _ejecutar_consultar_agenda(db: Session, usuario: Usuario, parametros: dict) -> dict:
    # No debería llamarse nunca: requiere_confirmacion=False hace que
    # /interpretar ya devuelva tipo="respuesta" con la contestación directa,
    # sin pasar por /confirmar.
    return {"mensaje": "", "resultado": None}


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
                "crea un entregable para Carlos, el informe de ventas, para el viernes",
                {
                    "nombre": "informe de ventas",
                    "descripcion": None,
                    "responsable": "Carlos",
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
        descripcion=(
            "Crear un nuevo proyecto/tema/subtema. Sin tema_padre, es un proyecto/tema raíz nuevo y "
            "quien lo crea queda automáticamente como dirección (N1). Con tema_padre, crea un "
            "subtema DENTRO de ese tema/proyecto ya existente (requiere ser dirección o líder del "
            "padre) -- usar esto cuando digan 'crea un subtema/tema dentro de X' o 'agrega un tema "
            "a X'."
        ),
        parametros_llm={
            "nombre": "nombre del proyecto/tema/subtema",
            "descripcion": "descripción opcional, o null si no se dijo",
            "tema_padre": "nombre del tema/proyecto padre si se mencionó que va DENTRO de otro, si no dejar vacío",
        },
        ejemplos=[
            (
                "crea un proyecto nuevo llamado Expansión Norte",
                {"nombre": "Expansión Norte", "descripcion": None, "tema_padre": ""},
            ),
            (
                "crea un subtema llamado Programas IA dentro de Innovación Digital",
                {"nombre": "Programas IA", "descripcion": None, "tema_padre": "Innovación Digital"},
            ),
        ],
        resolver=_resolver_crear_proyecto,
        ejecutar=_ejecutar_crear_proyecto,
    ),
    "agendar_reunion": ToolSpec(
        nombre="agendar_reunion",
        descripcion="Agendar una reunión dentro de un proyecto/tema, o una reunión general sin proyecto, "
        "con título, fecha/hora y participantes opcionales.",
        parametros_llm={
            "titulo": "tema o título de la reunión",
            "fecha_inicio": "fecha y hora tal como se dijo (ej. 'el jueves a las 3pm', 'mañana a las 10 de la mañana')",
            "duracion_minutos": "número de minutos que dura, o null si no se dijo (por defecto 30)",
            "participantes": "nombres de los invitados tal como se mencionaron, separados por 'y'; vacío si no se dijo",
            "proyecto": "nombre del proyecto/tema si se mencionó; 'general' si se dijo explícitamente que es "
            "una reunión general/sin proyecto; vacío si no se dijo nada",
        },
        ejemplos=[
            (
                "agenda una reunión con Carlos el jueves a las 3pm",
                {
                    "titulo": "reunión con Carlos",
                    "fecha_inicio": "el jueves a las 3pm",
                    "duracion_minutos": None,
                    "participantes": "Carlos",
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
            (
                "agenda una reunión general con Sofía el viernes a las 9am para ver temas varios",
                {
                    "titulo": "temas varios",
                    "fecha_inicio": "el viernes a las 9am",
                    "duracion_minutos": None,
                    "participantes": "Sofía",
                    "proyecto": "general",
                },
            ),
        ],
        resolver=_resolver_agendar_reunion,
        ejecutar=_ejecutar_agendar_reunion,
    ),
    "asignar_rol": ToolSpec(
        nombre="asignar_rol",
        descripcion="Cambiar el rol (dirección/líder/colaborador interno/externo) de alguien que YA participa en el proyecto. Si la persona todavía no participa en el proyecto, usa agregar_miembro en vez de esta.",
        parametros_llm={
            "persona": "nombre de la persona tal como se mencionó",
            "rol": "rol tal como se dijo (dirección, líder, colaborador interno, colaborador externo, N1-N4)",
            "supervisor": "nombre de quien lo supervisa, solo si se dijo y el rol es colaborador interno/externo; si no, vacío",
            "proyecto": "nombre del proyecto si se mencionó, si no dejar vacío",
        },
        ejemplos=[
            (
                "pon a Roberto como líder de este proyecto",
                {"persona": "Roberto", "rol": "líder", "supervisor": "", "proyecto": ""},
            ),
            (
                "agrega a Sofía como colaboradora externa, que la supervise Roberto",
                {"persona": "Sofía", "rol": "colaboradora externa", "supervisor": "Roberto", "proyecto": ""},
            ),
        ],
        resolver=_resolver_asignar_rol,
        ejecutar=_ejecutar_asignar_rol,
    ),
    "agregar_miembro": ToolSpec(
        nombre="agregar_miembro",
        descripcion=(
            "Agregar a alguien que TODAVÍA NO participa en el proyecto/tema/subtema, con un rol "
            "(dirección/líder/colaborador interno/externo). Es también cómo se 'comparte' un "
            "tema/subtema con alguien -- ej. 'comparte el subtema Agenda Inteligente con Juan José' "
            "usa esta misma tool con rol dirección. Si la persona ya participa y solo se le quiere "
            "cambiar el rol, usa asignar_rol en vez de esta. Requiere ser dirección o líder del "
            "proyecto/tema."
        ),
        parametros_llm={
            "persona": "nombre de la persona a agregar tal como se mencionó",
            "rol": "rol tal como se dijo (dirección, líder, colaborador interno, colaborador externo, N1-N4)",
            "supervisor": "nombre de quien lo supervisa, solo si se dijo y el rol es colaborador interno/externo; si no, vacío",
            "proyecto": "nombre del proyecto si se mencionó, si no dejar vacío",
        },
        ejemplos=[
            (
                "agrega a Jasso como líder del proyecto",
                {"persona": "Jasso", "rol": "líder", "supervisor": "", "proyecto": ""},
            ),
            (
                "mete a David al proyecto como colaborador externo, que lo supervise Bernardo",
                {"persona": "David", "rol": "colaborador externo", "supervisor": "Bernardo", "proyecto": ""},
            ),
        ],
        resolver=_resolver_agregar_miembro,
        ejecutar=_ejecutar_agregar_miembro,
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
                "agrega un acuerdo a la minuta de la reunión de revisión de presupuesto: enviar el reporte final, responsable Sofía",
                {
                    "reunion": "revisión de presupuesto",
                    "descripcion": "enviar el reporte final",
                    "responsable": "Sofía",
                    "proyecto": "",
                },
            ),
        ],
        resolver=_resolver_registrar_acuerdo,
        ejecutar=_ejecutar_registrar_acuerdo,
    ),
    "agregar_nota": ToolSpec(
        nombre="agregar_nota",
        descripcion="Agregar una nota/comentario a una reunión o a un entregable que ya existen.",
        parametros_llm={
            "reunion": "título de la reunión, si la nota es sobre una reunión; vacío si no",
            "entregable": "nombre del entregable, si la nota es sobre un entregable; vacío si no",
            "contenido": "el texto de la nota",
            "proyecto": "nombre del proyecto si se mencionó, si no dejar vacío",
        },
        ejemplos=[
            (
                "agrega una nota a la reunión de revisión de presupuesto: se pospone al viernes",
                {"reunion": "revisión de presupuesto", "entregable": "", "contenido": "se pospone al viernes", "proyecto": ""},
            ),
            (
                "pon una nota en el entregable maqueta: falta la aprobación de Carlos",
                {"reunion": "", "entregable": "maqueta", "contenido": "falta la aprobación de Carlos", "proyecto": ""},
            ),
        ],
        resolver=_resolver_agregar_nota,
        ejecutar=_ejecutar_agregar_nota,
    ),
    "editar_reunion": ToolSpec(
        nombre="editar_reunion",
        descripcion="Cambiar la fecha/hora, título o participantes de una reunión que ya existe (reprogramar).",
        parametros_llm={
            "reunion": "título de la reunión a editar, tal como se mencionó",
            "titulo_nuevo": "nuevo título, si se pidió cambiarlo; vacío si no",
            "fecha_inicio": "nueva fecha y hora tal como se dijo, si se pidió reprogramar (ej. 'el viernes a las 4pm'); vacío si no",
            "duracion_minutos": "nueva duración en minutos, si se dijo; null si no",
            "participantes": "nombres de invitados a AGREGAR, separados por 'y', si se pidió; vacío si no",
            "proyecto": "nombre del proyecto si se mencionó, si no dejar vacío",
        },
        ejemplos=[
            (
                "cambia la reunión de revisión de avances al jueves a las 5pm",
                {"reunion": "revisión de avances", "titulo_nuevo": "", "fecha_inicio": "el jueves a las 5pm", "duracion_minutos": None, "participantes": "", "proyecto": ""},
            ),
            (
                "agrega a Lucía a la reunión con Carlos",
                {"reunion": "con Carlos", "titulo_nuevo": "", "fecha_inicio": "", "duracion_minutos": None, "participantes": "Lucía", "proyecto": ""},
            ),
        ],
        resolver=_resolver_editar_reunion,
        ejecutar=_ejecutar_editar_reunion,
    ),
    "editar_entregable": ToolSpec(
        nombre="editar_entregable",
        descripcion="Cambiar el nombre, descripción, fecha límite o responsable de un entregable que ya existe (no el avance — para eso usa actualizar_avance_entregable). Requiere ser dirección o líder del proyecto.",
        parametros_llm={
            "entregable": "nombre del entregable a editar, tal como se mencionó",
            "nombre_nuevo": "nuevo nombre, si se pidió cambiarlo; vacío si no",
            "descripcion_nueva": "nueva descripción, si se pidió cambiarla; vacío si no",
            "fecha_entrega": "nueva fecha límite tal como se dijo, si se pidió cambiarla; vacío si no",
            "responsable_nuevo": "nombre de la nueva persona responsable, si se pidió reasignar; vacío si no",
            "proyecto": "nombre del proyecto si se mencionó, si no dejar vacío",
        },
        ejemplos=[
            (
                "cambia la fecha límite del informe de ventas al 30 de agosto",
                {"entregable": "informe de ventas", "nombre_nuevo": "", "descripcion_nueva": "", "fecha_entrega": "el 30 de agosto", "responsable_nuevo": "", "proyecto": ""},
            ),
            (
                "reasigna la maqueta a Sofía",
                {"entregable": "maqueta", "nombre_nuevo": "", "descripcion_nueva": "", "fecha_entrega": "", "responsable_nuevo": "Sofía", "proyecto": ""},
            ),
        ],
        resolver=_resolver_editar_entregable,
        ejecutar=_ejecutar_editar_entregable,
    ),
    "editar_proyecto": ToolSpec(
        nombre="editar_proyecto",
        descripcion="Cambiar el nombre o la descripción de un proyecto que ya existe. Requiere ser dirección o líder del proyecto.",
        parametros_llm={
            "proyecto": "nombre del proyecto a editar, tal como se mencionó",
            "nombre_nuevo": "nuevo nombre, si se pidió cambiarlo; vacío si no",
            "descripcion_nueva": "nueva descripción, si se pidió cambiarla; vacío si no",
        },
        ejemplos=[
            (
                "cambia el nombre del proyecto Cubo a Cubo 2.0",
                {"proyecto": "Cubo", "nombre_nuevo": "Cubo 2.0", "descripcion_nueva": ""},
            ),
        ],
        resolver=_resolver_editar_proyecto,
        ejecutar=_ejecutar_editar_proyecto,
    ),
    "leer_notificaciones": ToolSpec(
        nombre="leer_notificaciones",
        descripcion=(
            "Leer las notificaciones/avisos del usuario — consulta de SOLO LECTURA, no ejecuta "
            "ninguna acción. Úsala para pedidos como 'lee mis notificaciones', 'qué avisos tengo', "
            "'tengo notificaciones nuevas', 'muéstrame mis notificaciones'."
        ),
        parametros_llm={
            "filtro": "'no_leidas' (default si no se especifica) o 'todas' si se pidió explícitamente ver también las ya leídas",
        },
        ejemplos=[
            ("lee mis notificaciones", {"filtro": "no_leidas"}),
            ("qué notificaciones tengo sin leer", {"filtro": "no_leidas"}),
            ("muéstrame todas mis notificaciones, incluidas las leídas", {"filtro": "todas"}),
        ],
        resolver=_resolver_leer_notificaciones,
        ejecutar=_ejecutar_leer_notificaciones,
        requiere_confirmacion=False,
    ),
    "eliminar_entregable": ToolSpec(
        nombre="eliminar_entregable",
        descripcion="Eliminar un entregable que ya existe (acción irreversible). Requiere ser dirección o líder del proyecto.",
        parametros_llm={
            "entregable": "nombre del entregable a eliminar, tal como se mencionó",
            "proyecto": "nombre del proyecto si se mencionó, si no dejar vacío",
        },
        ejemplos=[
            ("elimina el entregable informe de ventas", {"entregable": "informe de ventas", "proyecto": ""}),
            ("borra la tarea maqueta del proyecto Cubo", {"entregable": "maqueta", "proyecto": "Cubo"}),
        ],
        resolver=_resolver_eliminar_entregable,
        ejecutar=_ejecutar_eliminar_entregable,
    ),
    "eliminar_proyecto": ToolSpec(
        nombre="eliminar_proyecto",
        descripcion=(
            "Eliminar un proyecto completo y todo lo que tiene (entregables, reuniones, minutas, "
            "equipo) — acción irreversible. Requiere ser dirección o líder del proyecto."
        ),
        parametros_llm={"proyecto": "nombre del proyecto a eliminar, tal como se mencionó"},
        ejemplos=[("elimina el proyecto Escuelas", {"proyecto": "Escuelas"})],
        resolver=_resolver_eliminar_proyecto,
        ejecutar=_ejecutar_eliminar_proyecto,
    ),
    "listar_subtemas": ToolSpec(
        nombre="listar_subtemas",
        descripcion="Solo lectura: decir qué subtemas tiene un proyecto/tema (un solo nivel, los hijos directos).",
        parametros_llm={"proyecto": "nombre del proyecto/tema del que se quieren ver los subtemas, si no dejar vacío"},
        ejemplos=[("qué subtemas tiene Cubo", {"proyecto": "Cubo"})],
        resolver=_resolver_listar_subtemas,
        ejecutar=_ejecutar_listar_subtemas,
        requiere_confirmacion=False,
    ),
    "mover_tema": ToolSpec(
        nombre="mover_tema",
        descripcion=(
            "Mover un tema/subtema/proyecto para que quede DENTRO de otro tema/proyecto (cambia su "
            "padre en la jerarquía). Requiere ser dirección o líder tanto de lo que se mueve como "
            "del destino."
        ),
        parametros_llm={
            "tema": "nombre del tema/subtema/proyecto que se va a mover",
            "nuevo_tema_padre": "nombre del tema/proyecto destino, dentro del cual va a quedar",
        },
        ejemplos=[
            (
                "mueve el subtema Agenda Inteligente dentro de Programas IA",
                {"tema": "Agenda Inteligente", "nuevo_tema_padre": "Programas IA"},
            ),
        ],
        resolver=_resolver_mover_tema,
        ejecutar=_ejecutar_mover_tema,
    ),
    "eliminar_reunion": ToolSpec(
        nombre="eliminar_reunion",
        descripcion="Eliminar (cancelar) una reunión que ya existe — acción irreversible. Requiere ser dirección/líder del proyecto o el organizador.",
        parametros_llm={
            "reunion": "título de la reunión a eliminar, tal como se mencionó",
            "proyecto": "nombre del proyecto si se mencionó, si no dejar vacío",
        },
        ejemplos=[("cancela la reunión de revisión de avances", {"reunion": "revisión de avances", "proyecto": ""})],
        resolver=_resolver_eliminar_reunion,
        ejecutar=_ejecutar_eliminar_reunion,
    ),
    "eliminar_acuerdo": ToolSpec(
        nombre="eliminar_acuerdo",
        descripcion="Eliminar un acuerdo de la minuta de una reunión — acción irreversible.",
        parametros_llm={
            "reunion": "título de la reunión cuya minuta tiene el acuerdo",
            "acuerdo": "descripción del acuerdo a eliminar, tal como se mencionó",
            "proyecto": "nombre del proyecto si se mencionó, si no dejar vacío",
        },
        ejemplos=[
            (
                "elimina el acuerdo de enviar el reporte final de la reunión de revisión de presupuesto",
                {"reunion": "revisión de presupuesto", "acuerdo": "enviar el reporte final", "proyecto": ""},
            ),
        ],
        resolver=_resolver_eliminar_acuerdo,
        ejecutar=_ejecutar_eliminar_acuerdo,
    ),
    "convertir_acuerdo_a_entregable": ToolSpec(
        nombre="convertir_acuerdo_a_entregable",
        descripcion="Convertir un acuerdo ya registrado en una minuta en un Entregable real, con fecha límite.",
        parametros_llm={
            "reunion": "título de la reunión cuya minuta tiene el acuerdo",
            "acuerdo": "descripción del acuerdo a convertir, tal como se mencionó",
            "responsable": "nombre de quien será responsable del entregable, solo si el acuerdo no tiene ya uno; si no, vacío",
            "fecha_entrega": "fecha límite tal como se dijo (ej. 'el viernes', 'en dos semanas')",
            "proyecto": "nombre del proyecto si se mencionó, si no dejar vacío",
            "sensible": "true o false, si se dijo que es sensible/confidencial (default false)",
        },
        ejemplos=[
            (
                "convierte el acuerdo de enviar el reporte final en un entregable para el viernes",
                {
                    "reunion": "",
                    "acuerdo": "enviar el reporte final",
                    "responsable": "",
                    "fecha_entrega": "el viernes",
                    "proyecto": "",
                    "sensible": False,
                },
            ),
        ],
        resolver=_resolver_convertir_acuerdo,
        ejecutar=_ejecutar_convertir_acuerdo,
    ),
    "agregar_a_mi_equipo": ToolSpec(
        nombre="agregar_a_mi_equipo",
        descripcion=(
            "Guardar a una persona en la plantilla personal 'Mi equipo' del usuario (para aplicarla "
            "después de un clic a cualquier proyecto) — NO agrega a ningún proyecto todavía."
        ),
        parametros_llm={
            "persona": "nombre de la persona a guardar, tal como se mencionó",
            "rol": "rol con el que se guarda (dirección, líder, colaborador interno, colaborador externo, N1-N4)",
        },
        ejemplos=[
            ("guarda a Sofía en mi equipo como colaboradora", {"persona": "Sofía", "rol": "colaboradora interna"}),
        ],
        resolver=_resolver_agregar_a_mi_equipo,
        ejecutar=_ejecutar_agregar_a_mi_equipo,
    ),
    "quitar_de_mi_equipo": ToolSpec(
        nombre="quitar_de_mi_equipo",
        descripcion="Quitar a una persona de la plantilla personal 'Mi equipo' del usuario — no la quita de ningún proyecto donde ya participe.",
        parametros_llm={"persona": "nombre de la persona a quitar, tal como se mencionó"},
        ejemplos=[("quita a Roberto de mi equipo guardado", {"persona": "Roberto"})],
        resolver=_resolver_quitar_de_mi_equipo,
        ejecutar=_ejecutar_quitar_de_mi_equipo,
    ),
    "aplicar_mi_equipo": ToolSpec(
        nombre="aplicar_mi_equipo",
        descripcion="Aplicar la plantilla personal 'Mi equipo' completa a un proyecto de un clic (asigna a todas las personas guardadas con su rol). Requiere ser dirección o líder del proyecto.",
        parametros_llm={"proyecto": "nombre del proyecto al que aplicar el equipo guardado, tal como se mencionó"},
        ejemplos=[("aplica mi equipo al proyecto Cubo", {"proyecto": "Cubo"})],
        resolver=_resolver_aplicar_mi_equipo,
        ejecutar=_ejecutar_aplicar_mi_equipo,
    ),
    "consultar_agenda": ToolSpec(
        nombre="consultar_agenda",
        descripcion=(
            "Responder preguntas sobre el estado de proyectos, entregables, avances, pendientes o "
            "vencidos — consulta de SOLO LECTURA, no ejecuta ninguna acción ni cambia nada. Úsala "
            "para cualquier pregunta que empiece con qué/cuál/cuántos/cómo va/dime, no para órdenes."
        ),
        parametros_llm={
            "pregunta": "la pregunta tal como la dijo el usuario, completa",
        },
        ejemplos=[
            (
                "¿cuáles son mis pendientes de esta semana?",
                {"pregunta": "¿cuáles son mis pendientes de esta semana?"},
            ),
            (
                "cómo va el avance del proyecto Cubo",
                {"pregunta": "cómo va el avance del proyecto Cubo"},
            ),
        ],
        resolver=_resolver_consultar_agenda,
        ejecutar=_ejecutar_consultar_agenda,
        requiere_confirmacion=False,
    ),
}

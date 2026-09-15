"""
Servicio de proyectos: crear/editar proyecto, asignar rol en un proyecto, y
listar el equipo visible. Usado por el router REST (app/routers/proyectos.py)
y por el asistente de voz (app/services/asistente/) — en particular
`listar_equipo_visible` es la fuente que usa el asistente para resolver un
nombre dicho en voz a un usuario_id real, respetando la misma visibilidad
N1/N2/N3-N4 de siempre (nunca GET /usuarios, que exige N1 global).
"""
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.permissions import (
    obtener_rol_en_proyecto,
    obtener_rol_local_en_proyecto,
    requerir_participacion_en_proyecto,
    requerir_rol_minimo,
)
from app.services.contenido_sensible import verificar_contenido
from app.models.entregable import Entregable
from app.models.equipo_miembro import EquipoMiembro
from app.models.notificacion import Notificacion
from app.models.proyecto import Proyecto
from app.models.reunion import Reunion
from app.models.usuario import RolEnum, Usuario
from app.models.usuario_proyecto_rol import UsuarioProyectoRol
from app.schemas.proyecto import MiembroEquipoOut, ProyectoOut
from app.services import arbol_proyectos
from app.services.equipos import rol_default_para_nuevo_proyecto


def obtener_proyecto_o_404(db: Session, proyecto_id: int) -> Proyecto:
    proyecto = db.query(Proyecto).filter(Proyecto.id == proyecto_id).first()
    if not proyecto:
        raise HTTPException(status_code=404, detail="Tema no encontrado")
    return proyecto


def proyecto_a_out(db: Session, usuario: Usuario, proyecto: Proyecto) -> ProyectoOut:
    """Arma el ProyectoOut con los campos de permiso YA calculados en
    servidor (rol_efectivo/puede_administrar, con herencia del árbol de
    temas -- ver obtener_rol_en_proyecto) -- el frontend nunca debe
    recalcularlos cruzando usuario.roles_por_proyecto."""
    if usuario.es_super_admin:
        rol_efectivo = RolEnum.N1
    else:
        fila = obtener_rol_en_proyecto(db, usuario.id, proyecto.id)
        rol_efectivo = fila.rol if fila else None
    tiene_hijos = (
        db.query(Proyecto.id).filter(Proyecto.parent_id == proyecto.id).first() is not None
    )
    return ProyectoOut(
        id=proyecto.id,
        nombre=proyecto.nombre,
        descripcion=proyecto.descripcion,
        activo=proyecto.activo,
        parent_id=proyecto.parent_id,
        fecha_creacion=proyecto.fecha_creacion,
        rol_efectivo=rol_efectivo,
        puede_administrar=rol_efectivo in (RolEnum.N1, RolEnum.N2),
        tiene_hijos=tiene_hijos,
    )


def listar_proyectos_visibles(db: Session, usuario: Usuario) -> list[Proyecto]:
    """Todo nodo donde el usuario tiene fila explícita, MÁS todo su
    subárbol (a cualquier profundidad) -- generalización 2026-08-16 para
    resolver por voz/chatbot cualquier tema/subtema, no solo raíces (ver
    resolver_proyecto en asistente/resolucion.py, equipo_resumen.py,
    llm_privacidad.py). Para el listado top-level de "Tus proyectos" y el
    dashboard, que quieren solo los puntos de entrada sin duplicar, ver
    listar_raices_visibles. Un super admin ve TODOS los proyectos, incluso
    sin fila en usuario_proyecto_rol."""
    if usuario.es_super_admin:
        return db.query(Proyecto).all()

    proyecto_ids_propios = [
        r.proyecto_id
        for r in db.query(UsuarioProyectoRol)
        .filter(UsuarioProyectoRol.usuario_id == usuario.id)
        .all()
    ]
    indice = arbol_proyectos.cargar_indice(db)
    ids_visibles: set[int] = set()
    for raiz_id in proyecto_ids_propios:
        ids_visibles |= arbol_proyectos.ids_subarbol(indice, raiz_id)
    return db.query(Proyecto).filter(Proyecto.id.in_(ids_visibles)).all()


def listar_arbol_visible(db: Session, usuario: Usuario) -> list[dict]:
    """Lista PLANA {id, nombre, ruta} de TODO el árbol visible (no solo
    raíces, a diferencia de listar_raices_visibles) -- para selectores de
    "elige un tema/subtema" que no dependen de estar parado en un nodo
    puntual, ej. el picker de "sección" del checklist de una junta general
    (ver app/routers/series_reunion.py, agregado 2026-08-17 para el caso
    Diana). Reutiliza listar_proyectos_visibles tal cual, sin regla de
    permisos nueva -- `ruta` es solo cosmética (para distinguir subtemas
    con el mismo nombre bajo padres distintos)."""
    proyectos = listar_proyectos_visibles(db, usuario)
    indice = arbol_proyectos.cargar_indice(db)

    cadenas: dict[int, list[int]] = {}
    ids_en_cadenas: set[int] = set()
    for p in proyectos:
        cadena = list(reversed(arbol_proyectos.cadena_ancestros(indice, p.id)))
        cadenas[p.id] = cadena
        ids_en_cadenas.update(cadena)

    nombres = {
        pid: nombre
        for pid, nombre in db.query(Proyecto.id, Proyecto.nombre)
        .filter(Proyecto.id.in_(ids_en_cadenas))
        .all()
    }
    resultado = [
        {
            "id": p.id,
            "nombre": p.nombre,
            "ruta": " > ".join(nombres.get(pid, "?") for pid in cadenas[p.id]),
            "parent_id": p.parent_id,
        }
        for p in proyectos
    ]
    resultado.sort(key=lambda r: r["ruta"])
    return resultado


def listar_raices_visibles(db: Session, usuario: Usuario) -> list[Proyecto]:
    """Como listar_proyectos_visibles, pero solo los nodos cuyo padre NO
    está también en el conjunto visible -- evita duplicar/doble-contar
    cuando alguien tiene fila explícita en una raíz Y en un subtema de esa
    misma raíz. Para los 9 proyectos reales existentes (todos raíz) es
    idéntico a listar_proyectos_visibles. Usado por GET /proyectos
    (listado top-level) y dashboard.py."""
    if usuario.es_super_admin:
        return db.query(Proyecto).filter(Proyecto.parent_id.is_(None)).all()

    visibles = listar_proyectos_visibles(db, usuario)
    ids_visibles = {p.id for p in visibles}
    return [p for p in visibles if p.parent_id not in ids_visibles]


def _siguiente_orden(db: Session, parent_id: int | None, al_frente: bool = False) -> int:
    """Siguiente valor de `orden` entre hermanos (mismo parent_id) -- para
    que un tema recién creado quede al final de la lista de importancia en
    vez de empatado en 0 con todos los demás (mover_proyecto intercambia
    valores de `orden`; si dos hermanos comparten el mismo valor, la
    "flecha" no mueve nada visible). Mismo criterio que ya usa
    agregar_item_agenda con AgendaItem.orden.

    `al_frente=True` (2026-08-19, alta rápida desde Vista Equipo) hace lo
    contrario: un valor MENOR al mínimo de sus hermanos, para que quede de
    prioridad 1 en vez de al final."""
    if al_frente:
        minimo = (
            db.query(Proyecto.orden)
            .filter(Proyecto.parent_id == parent_id)
            .order_by(Proyecto.orden.asc())
            .first()
        )
        return (minimo[0] - 1) if minimo else 0
    maximo = (
        db.query(Proyecto.orden)
        .filter(Proyecto.parent_id == parent_id)
        .order_by(Proyecto.orden.desc())
        .first()
    )
    return (maximo[0] + 1) if maximo else 0


def crear_proyecto(
    db: Session,
    usuario: Usuario,
    nombre: str,
    descripcion: str | None,
    parent_id: int | None = None,
    al_frente: bool = False,
) -> Proyecto:
    """Sin parent_id (nodo raíz): cualquier usuario autenticado puede
    crear un proyecto. Por default queda como N1 (dirección) de él --
    salvo que alguien más ya lo tenga guardado en su plantilla de "mi
    equipo", en cuyo caso hereda ese rol (ver rol_default_para_nuevo_proyecto).

    Si hereda N2/N3/N4, el dueño de esa plantilla se agrega también al
    proyecto (como N1 si el creador hereda N2, o como N2/supervisor si
    hereda N3/N4) -- si no, el creador queda sin nadie con permiso para
    terminar de organizar su propio equipo recién creado (asignar roles
    requiere N1/N2), y cualquier instrucción compuesta tipo "crea el
    proyecto y pon a Fulano de líder" se rompería justo ahí. Refleja la
    jerarquía real: quien tiene guardado a alguien en su equipo queda como
    dirección/líder de los proyectos que esa persona crea, salvo que se
    reasigne después.

    Con parent_id (subtema, 2026-08-16): exige N1/N2 (local o heredado) en
    el padre -- quien lidera un tema puede crear subtemas dentro. El
    creador queda con una fila LOCAL en el nodo nuevo, con su mismo rol
    efectivo en el padre (así listar_equipo_visible/resolver_persona_en_equipo,
    que son node-local a propósito, nunca encuentran un nodo recién creado
    sin equipo). NO hereda automáticamente el supervisor de "Mi equipo" --
    esa regla es específica de proyectos nuevos de cero, no de anidar
    dentro de algo que ya tiene dueño."""
    verificar_contenido(db, usuario, "proyecto", nombre=nombre, descripcion=descripcion)

    if parent_id is not None:
        rol_padre = requerir_participacion_en_proyecto(db, usuario, parent_id)
        requerir_rol_minimo(rol_padre, [RolEnum.N1, RolEnum.N2])
        obtener_proyecto_o_404(db, parent_id)

        nuevo = Proyecto(
            nombre=nombre,
            descripcion=descripcion,
            parent_id=parent_id,
            orden=_siguiente_orden(db, parent_id, al_frente),
        )
        db.add(nuevo)
        db.flush()
        db.add(
            UsuarioProyectoRol(
                usuario_id=usuario.id, proyecto_id=nuevo.id, rol=rol_padre.rol, supervisor_id=None
            )
        )
        return nuevo

    nuevo = Proyecto(nombre=nombre, descripcion=descripcion, orden=_siguiente_orden(db, None, al_frente))
    db.add(nuevo)
    db.flush()

    rol, dueno_id = rol_default_para_nuevo_proyecto(db, usuario)
    supervisor_id = dueno_id if rol in (RolEnum.N3, RolEnum.N4) else None
    db.add(
        UsuarioProyectoRol(
            usuario_id=usuario.id, proyecto_id=nuevo.id, rol=rol, supervisor_id=supervisor_id
        )
    )
    if dueno_id is not None:
        rol_dueno = RolEnum.N1 if rol == RolEnum.N2 else RolEnum.N2
        db.add(
            UsuarioProyectoRol(
                usuario_id=dueno_id, proyecto_id=nuevo.id, rol=rol_dueno, supervisor_id=None
            )
        )
    return nuevo


NOMBRE_TEMA_TAREAS_SUELTAS = "Tareas sueltas"


def obtener_o_crear_tema_tareas_sueltas(
    db: Session, usuario_responsable: Usuario, asignado_por: Usuario | None = None
) -> Proyecto:
    """Tema raíz personal "Tareas sueltas" de `usuario_responsable` (2026-08-20,
    a petición de Yue: hacer el tema opcional al crear una tarea -- si no se
    especifica ninguno, ni desde Agenda Plan B ni por voz, la tarea cae aquí
    en vez de exigir elegir un tema real). Es un Proyecto normal, raíz, sin
    ninguna marca especial en el modelo -- se identifica por convención
    (nombre exacto + único dueño). Debe llamarse SIEMPRE con el RESPONSABLE
    de la tarea, nunca con quien la crea/asigna, para que el tema quede bajo
    la propiedad de quien de verdad debe verlo en su Seguimiento (mismo
    resultado que si esa persona lo hubiera creado ella misma a mano).

    `asignado_por` (2026-08-24, a petición de Yue: que "Asigné" en
    MiSemana.jsx siempre refleje la realidad) -- si se pasa y es distinto de
    `usuario_responsable`, se asegura de que quede con un rol (N2,
    supervisor) en este tema si todavía no tiene ninguno. Sin esto, alguien
    que solo aparece en tu selector de "a quién asignar" por ya reportarte
    en OTRO tema real (no por estar guardado en tu "Mi equipo", ver
    listar_mi_equipo_efectivo) podía recibir su primera tarea suelta sin que
    tú quedaras con acceso a ese tema personal -- la tarea desaparecía de tu
    vista pese a haberla asignado tú.

    Hace su propio commit: se usa como paso de resolución previo e
    independiente (desde el router de tareas-sueltas o desde el asistente de
    voz), antes de que el caller decida qué hacer con el proyecto_id
    resultante -- no depende de que la transacción del entregable termine
    bien."""
    existente = (
        db.query(Proyecto)
        .join(UsuarioProyectoRol, UsuarioProyectoRol.proyecto_id == Proyecto.id)
        .filter(
            Proyecto.nombre == NOMBRE_TEMA_TAREAS_SUELTAS,
            Proyecto.parent_id.is_(None),
            UsuarioProyectoRol.usuario_id == usuario_responsable.id,
        )
        .first()
    )
    if existente:
        _asegurar_acceso_asignador(db, existente, usuario_responsable, asignado_por)
        return existente

    nuevo = crear_proyecto(
        db, usuario=usuario_responsable, nombre=NOMBRE_TEMA_TAREAS_SUELTAS, descripcion=None
    )
    _asegurar_acceso_asignador(db, nuevo, usuario_responsable, asignado_por)
    db.commit()
    db.refresh(nuevo)
    return nuevo


def _asegurar_acceso_asignador(
    db: Session,
    proyecto: Proyecto,
    usuario_responsable: Usuario,
    asignado_por: Usuario | None,
) -> None:
    """Ver docstring de `obtener_o_crear_tema_tareas_sueltas`. Si agrega una
    fila nueva, comitea aquí mismo -- necesario para la rama "existente" de
    esa función, que de otro modo no comitea nada (es un camino de solo
    lectura salvo por este caso). Si no hay nada que hacer (sin
    `asignado_por`, es la misma persona, o ya tenía un rol), no toca la
    sesión."""
    if asignado_por is None or asignado_por.id == usuario_responsable.id:
        return
    ya_tiene_rol = (
        db.query(UsuarioProyectoRol)
        .filter(
            UsuarioProyectoRol.proyecto_id == proyecto.id,
            UsuarioProyectoRol.usuario_id == asignado_por.id,
        )
        .first()
    )
    if ya_tiene_rol:
        return
    db.add(
        UsuarioProyectoRol(
            usuario_id=asignado_por.id,
            proyecto_id=proyecto.id,
            rol=RolEnum.N2,
            supervisor_id=None,
        )
    )
    db.commit()


def listar_lideres_organizacion(db: Session) -> list[MiembroEquipoOut]:
    """Todas las personas con rol N1 o N2 en AL MENOS un tema, cruzando
    TODA la organización (2026-08-20, a petición de Yue: al reasignar una
    tarea que no le compete a quien la recibió, poder pasársela a "otro
    líder de otra área", no solo a alguien que ya participa en ese tema).
    Sin regla de permisos nueva -- nombre/puesto ya son datos visibles en
    otros lugares del sistema (ej. "Mi equipo"), y cualquier usuario
    autenticado puede consultar esta lista para poder reasignar."""
    ids_usuario = (
        db.query(UsuarioProyectoRol.usuario_id)
        .filter(UsuarioProyectoRol.rol.in_([RolEnum.N1, RolEnum.N2]))
        .distinct()
        .all()
    )
    ids_usuario = [row[0] for row in ids_usuario]
    if not ids_usuario:
        return []
    usuarios = db.query(Usuario).filter(Usuario.id.in_(ids_usuario)).all()
    return [
        MiembroEquipoOut(
            usuario_id=u.id,
            nombre=u.nombre,
            puesto=u.puesto,
            email=u.email,
            rol=RolEnum.N2,  # etiqueta genérica: la lista mezcla gente N1/N2 de temas distintos, no hay "un" rol único por persona aquí
            supervisor_id=None,
        )
        for u in usuarios
    ]


def es_lider_en_algun_tema(db: Session, usuario_id: int) -> bool:
    """True si `usuario_id` tiene rol N1 o N2 en AL MENOS un tema -- usado
    por reasignar_entregable (app/services/entregables.py) para decidir si
    se puede agregar automáticamente a alguien que no participa todavía en
    el tema de la tarea que se le reasigna."""
    return (
        db.query(UsuarioProyectoRol)
        .filter(
            UsuarioProyectoRol.usuario_id == usuario_id,
            UsuarioProyectoRol.rol.in_([RolEnum.N1, RolEnum.N2]),
        )
        .first()
        is not None
    )


def actualizar_proyecto(db: Session, usuario: Usuario, proyecto_id: int, campos: dict) -> Proyecto:
    rol = requerir_participacion_en_proyecto(db, usuario, proyecto_id)
    requerir_rol_minimo(rol, [RolEnum.N1, RolEnum.N2])

    proyecto = obtener_proyecto_o_404(db, proyecto_id)

    verificar_contenido(
        db, usuario, "proyecto", nombre=campos.get("nombre"), descripcion=campos.get("descripcion")
    )

    for campo, valor in campos.items():
        if valor is not None:
            setattr(proyecto, campo, valor)
    return proyecto


def mover_proyecto(db: Session, usuario: Usuario, proyecto_id: int, direccion: str) -> None:
    """Intercambia el `orden` de este tema con su vecino más cercano ENTRE
    HERMANOS (mismo parent_id) -- 2026-08-18, a petición de Yue: "ordenar
    los temas del más importante al menos importante" en Vista Equipo.
    Mismo patrón de flechas ↑/↓ que ya usa mover_item_agenda
    (app/services/series_reunion.py) para reordenar la agenda de una junta.

    El orden es GLOBAL por tema, no por viewer -- los hermanos considerados
    son TODOS los que comparten parent_id, sin filtrar por visibilidad
    (igual que mover_item_agenda no filtra sus hermanos por quién los ve).
    Requiere N1/N2 (local o heredado) del tema que se mueve -- mismo
    permiso que editar/eliminar (actualizar_proyecto/eliminar_proyecto)."""
    rol = requerir_participacion_en_proyecto(db, usuario, proyecto_id)
    requerir_rol_minimo(rol, [RolEnum.N1, RolEnum.N2])
    if direccion not in ("arriba", "abajo"):
        raise HTTPException(status_code=400, detail="direccion debe ser 'arriba' o 'abajo'")

    proyecto = obtener_proyecto_o_404(db, proyecto_id)
    hermanos = (
        db.query(Proyecto)
        .filter(Proyecto.parent_id == proyecto.parent_id)
        .order_by(Proyecto.orden, Proyecto.id)
        .all()
    )
    posicion = next((i for i, h in enumerate(hermanos) if h.id == proyecto.id), None)
    if posicion is None:
        return
    vecino_pos = posicion - 1 if direccion == "arriba" else posicion + 1
    if vecino_pos < 0 or vecino_pos >= len(hermanos):
        return  # ya está en el extremo, no hay nada que mover
    vecino = hermanos[vecino_pos]
    proyecto.orden, vecino.orden = vecino.orden, proyecto.orden


def eliminar_proyecto(db: Session, usuario: Usuario, proyecto_id: int) -> None:
    """
    Elimina el proyecto/tema y TODO su subárbol (subtemas a cualquier
    profundidad, con su equipo, entregables, reuniones, minutas/acuerdos,
    notas -- la cascada de SQLAlchemy en `Proyecto.hijos` recorre el árbol
    completo sola, sin CTE ni SQL manual). Requiere N1 o N2 (local o
    heredado) -- igual que editar (actualizar_proyecto): un líder (N2)
    puede administrar por completo los proyectos/temas que lidera, aunque
    no los haya creado él. Decisión explícita de Yue, 2026-08-16 (antes
    era solo N1; y antes de la jerarquía, esto solo borraba un nodo sin
    hijos posibles).

    Notificacion no tiene relación ORM hacia Entregable/Reunion (es más un
    log/bandeja que un hijo propiamente dicho), así que sus filas se limpian
    aquí a mano antes del delete, para TODO el subárbol (no solo el nodo
    exacto) — el resto (historial de avance, notas, minuta+acuerdos,
    participantes) cascada solo vía las relaciones declaradas en los modelos.
    """
    rol = requerir_participacion_en_proyecto(db, usuario, proyecto_id)
    requerir_rol_minimo(rol, [RolEnum.N1, RolEnum.N2])

    proyecto = obtener_proyecto_o_404(db, proyecto_id)

    indice = arbol_proyectos.cargar_indice(db)
    ids_subtree = arbol_proyectos.ids_subarbol(indice, proyecto_id)

    entregable_ids = [
        e.id for e in db.query(Entregable).filter(Entregable.proyecto_id.in_(ids_subtree)).all()
    ]
    reunion_ids = [
        r.id for r in db.query(Reunion).filter(Reunion.proyecto_id.in_(ids_subtree)).all()
    ]
    if entregable_ids:
        db.query(Notificacion).filter(Notificacion.entregable_id.in_(entregable_ids)).delete(
            synchronize_session=False
        )
    if reunion_ids:
        db.query(Notificacion).filter(Notificacion.reunion_id.in_(reunion_ids)).delete(
            synchronize_session=False
        )

    db.delete(proyecto)


def listar_hijos_directos(db: Session, usuario: Usuario, proyecto_id: int) -> list[Proyecto]:
    """Subtemas directos de un nodo (un solo nivel) -- exige participación
    (local o heredada) en el nodo, igual que cualquier otra consulta sobre él."""
    requerir_participacion_en_proyecto(db, usuario, proyecto_id)
    return db.query(Proyecto).filter(Proyecto.parent_id == proyecto_id).all()


def listar_ancestros(db: Session, usuario: Usuario, proyecto_id: int) -> list[Proyecto]:
    """Cadena de ancestros de un nodo, del más lejano (raíz) al padre
    directo -- para armar el breadcrumb ("de lo general a lo particular").
    No incluye al propio nodo."""
    requerir_participacion_en_proyecto(db, usuario, proyecto_id)
    indice = arbol_proyectos.cargar_indice(db)
    cadena = arbol_proyectos.cadena_ancestros(indice, proyecto_id)[1:]
    cadena.reverse()
    if not cadena:
        return []
    proyectos_por_id = {
        p.id: p for p in db.query(Proyecto).filter(Proyecto.id.in_(cadena)).all()
    }
    return [proyectos_por_id[nodo_id] for nodo_id in cadena if nodo_id in proyectos_por_id]


def resumen_subarbol(db: Session, usuario: Usuario, proyecto_id: int) -> dict:
    """Conteo de lo que colgaría de borrar este nodo -- para avisar antes
    de confirmar un delete (UI y tool de voz), ya que con jerarquía borrar
    un nodo alto puede arrastrar subtemas compartidos con otras personas
    sin que sea obvio de un vistazo."""
    requerir_participacion_en_proyecto(db, usuario, proyecto_id)
    indice = arbol_proyectos.cargar_indice(db)
    ids_subtree = arbol_proyectos.ids_subarbol(indice, proyecto_id)
    ids_subtemas = ids_subtree - {proyecto_id}
    return {
        "total_subtemas": len(ids_subtemas),
        "total_entregables": db.query(Entregable)
        .filter(Entregable.proyecto_id.in_(ids_subtree))
        .count(),
        "total_reuniones": db.query(Reunion)
        .filter(Reunion.proyecto_id.in_(ids_subtree))
        .count(),
    }


def mover_nodo(db: Session, usuario: Usuario, proyecto_id: int, nuevo_parent_id: int) -> Proyecto:
    """Mueve un tema/subtema a otro padre. Requiere N1/N2 (local o
    heredado) tanto en el nodo que se mueve como en el destino -- mover
    algo requiere poder administrar de dónde sale y a dónde entra. Prohíbe
    mover un nodo dentro de sí mismo o de su propio descendiente (crearía
    un ciclo)."""
    if proyecto_id == nuevo_parent_id:
        raise HTTPException(status_code=400, detail="Un tema no puede ser su propio padre")

    rol_origen = requerir_participacion_en_proyecto(db, usuario, proyecto_id)
    requerir_rol_minimo(rol_origen, [RolEnum.N1, RolEnum.N2])
    rol_destino = requerir_participacion_en_proyecto(db, usuario, nuevo_parent_id)
    requerir_rol_minimo(rol_destino, [RolEnum.N1, RolEnum.N2])

    indice = arbol_proyectos.cargar_indice(db)
    if arbol_proyectos.es_descendiente(indice, nuevo_parent_id, proyecto_id):
        raise HTTPException(
            status_code=400,
            detail="No se puede mover un tema dentro de sí mismo o de uno de sus propios subtemas",
        )

    proyecto = obtener_proyecto_o_404(db, proyecto_id)
    obtener_proyecto_o_404(db, nuevo_parent_id)
    proyecto.parent_id = nuevo_parent_id
    return proyecto


def _equipo_efectivo_por_herencia(db: Session, proyecto_id: int) -> dict[int, UsuarioProyectoRol]:
    """Para cada persona con AL MENOS una fila en la cadena de ancestros de
    proyecto_id (él mismo primero, luego padre, abuelo...), devuelve su fila
    MÁS CERCANA -- mismo criterio "fila explícita más cercana" que
    obtener_rol_en_proyecto, pero resuelto para TODO el equipo en vez de
    para una sola persona. Usado por listar_equipo_visible(incluir_heredado=True)."""
    indice = arbol_proyectos.cargar_indice(db)
    cadena = arbol_proyectos.cadena_ancestros(indice, proyecto_id)
    filas_por_nodo: dict[int, list[UsuarioProyectoRol]] = {}
    for fila in db.query(UsuarioProyectoRol).filter(UsuarioProyectoRol.proyecto_id.in_(cadena)).all():
        filas_por_nodo.setdefault(fila.proyecto_id, []).append(fila)

    efectivo: dict[int, UsuarioProyectoRol] = {}
    for nodo_id in cadena:
        for fila in filas_por_nodo.get(nodo_id, []):
            if fila.usuario_id not in efectivo:
                efectivo[fila.usuario_id] = fila
    return efectivo


def listar_equipo_visible(
    db: Session, usuario: Usuario, proyecto_id: int, incluir_heredado: bool = False
) -> list[MiembroEquipoOut]:
    """
    Lista el equipo del proyecto, respetando visibilidad:
    - N1: ve a todos.
    - N2: ve a su equipo (los que supervisa) + él mismo.
    - N3/N4: se ven solo a sí mismos.

    `incluir_heredado` (2026-08-18, a petición de Yue -- bug real en Vista
    Equipo: un subtema nuevo (ej. bajo "Despacho") solo le da fila LOCAL a
    quien lo crea -- ver crear_proyecto, es a propósito, NO hereda
    automáticamente al resto del equipo del padre. Sin este parámetro, ese
    subtema queda sin ningún miembro local y `equipo_resumen.py` lo salta
    por completo para TODOS: nunca aparece como hijo colapsable de nadie en
    Vista Equipo, aunque sí es visible al entrar directo al tema (esa
    pantalla lista subtemas con `proyectosApi.hijos`, sin pasar por esta
    función). Con incluir_heredado=True, si no hay nadie local, resuelve el
    equipo efectivo caminando ancestros (_equipo_efectivo_por_herencia) en
    vez de devolver vacío.

    Deliberadamente NO es el default: "Administrar equipo" (ModalEquipo,
    vía GET /proyectos/{id}/usuarios), invitar a una reunión, y el
    asistente de voz siguen viendo solo miembros LOCALES -- mostrar ahí a
    alguien con acceso heredado sería confuso (ej. el botón "Quitar" no
    tendría ninguna fila local que borrar). Solo lo pasa
    equipo_resumen.py, que es de solo lectura."""
    rol = requerir_participacion_en_proyecto(db, usuario, proyecto_id)

    if incluir_heredado:
        registros = list(_equipo_efectivo_por_herencia(db, proyecto_id).values())
    else:
        registros = db.query(UsuarioProyectoRol).filter(UsuarioProyectoRol.proyecto_id == proyecto_id).all()

    if rol.rol == RolEnum.N1:
        pass
    elif rol.rol == RolEnum.N2:
        registros = [
            r for r in registros if r.supervisor_id == usuario.id or r.usuario_id == usuario.id
        ]
    else:
        registros = [r for r in registros if r.usuario_id == usuario.id]

    return [
        MiembroEquipoOut(
            usuario_id=r.usuario.id,
            nombre=r.usuario.nombre,
            puesto=r.usuario.puesto,
            email=r.usuario.email,
            rol=r.rol,
            supervisor_id=r.supervisor_id,
        )
        for r in registros
    ]


def asignar_rol_en_proyecto(
    db: Session, usuario: Usuario, proyecto_id: int, usuario_id: int, rol: RolEnum, supervisor_id: int | None
) -> MiembroEquipoOut:
    """
    Asigna (o reasigna) el rol de un usuario dentro de un proyecto/tema.
    Requiere N1 o N2 (local o heredado). "Compartir un tema/subtema" con
    alguien ES esto: crear su fila local en ESE nodo específico.

    Para N3/N4, si no se manda supervisor_id, queda como supervisor quien está
    haciendo la asignación (sea N1 o N2) — así alguien que es N1 de un proyecto
    recién creado puede agregar colaboradores sin tener que nombrar antes a un N2.

    Un Líder (N2) solo puede ADMINISTRAR SU EQUIPO -- decisión explícita de
    Yue, 2026-08-17: puede reasignar el rol de quien YA participa en este
    tema sin restricción (es justo "administrar su equipo"), pero para
    agregar a alguien que todavía NO participa aquí, esa persona debe estar
    en su plantilla personal "Mi equipo" -- si no, se rechaza (mismo criterio
    que ya aplica en el frontend, ModalEquipo.jsx, pero reforzado aquí para
    que tampoco se pueda saltar por API directa o por el asistente de voz,
    que reutiliza esta misma función). Dirección (N1) no tiene esta
    restricción -- puede agregar a cualquiera de la organización.
    """
    rol_actual = requerir_participacion_en_proyecto(db, usuario, proyecto_id)
    requerir_rol_minimo(rol_actual, [RolEnum.N1, RolEnum.N2])

    if rol_actual.rol == RolEnum.N2:
        ya_es_miembro = obtener_rol_local_en_proyecto(db, usuario_id, proyecto_id) is not None
        if not ya_es_miembro:
            en_su_plantilla = (
                db.query(EquipoMiembro)
                .filter(
                    EquipoMiembro.propietario_id == usuario.id,
                    EquipoMiembro.usuario_id == usuario_id,
                )
                .first()
                is not None
            )
            if not en_su_plantilla:
                raise HTTPException(
                    status_code=403,
                    detail="Como líder, solo puedes agregar a alguien que ya tengas guardado en "
                    "tu equipo ('Mi equipo'). Guárdalo ahí primero.",
                )

    if rol in (RolEnum.N3, RolEnum.N4) and supervisor_id is None:
        supervisor_id = usuario.id

    # OJO: búsqueda LOCAL (no obtener_rol_en_proyecto, que ahora hereda de
    # ancestros) -- usar la versión con herencia aquí reescribiría por error
    # la fila de un ancestro en vez de crear/actualizar la fila de ESTE nodo.
    existente = obtener_rol_local_en_proyecto(db, usuario_id, proyecto_id)
    if existente:
        existente.rol = rol
        existente.supervisor_id = supervisor_id
        registro = existente
    else:
        registro = UsuarioProyectoRol(
            usuario_id=usuario_id,
            proyecto_id=proyecto_id,
            rol=rol,
            supervisor_id=supervisor_id,
        )
        db.add(registro)
        db.flush()

    return MiembroEquipoOut(
        usuario_id=registro.usuario.id,
        nombre=registro.usuario.nombre,
        puesto=registro.usuario.puesto,
        email=registro.usuario.email,
        rol=registro.rol,
        supervisor_id=registro.supervisor_id,
    )


def quitar_miembro_de_proyecto(db: Session, usuario: Usuario, proyecto_id: int, usuario_id: int) -> None:
    """Quita a un usuario del proyecto/tema (elimina su fila LOCAL en ese
    nodo exacto). Requiere N1 o N2 (local o heredado). Quitar a alguien de
    un nodo no le quita el acceso que tenga por herencia desde un
    ancestro -- si su acceso ahí viene de un padre, no hay ninguna fila
    local que borrar (ver obtener_rol_local_en_proyecto)."""
    rol_actual = requerir_participacion_en_proyecto(db, usuario, proyecto_id)
    requerir_rol_minimo(rol_actual, [RolEnum.N1, RolEnum.N2])

    # OJO: búsqueda LOCAL, mismo motivo que en asignar_rol_en_proyecto --
    # usar la versión con herencia borraría la fila equivocada (la de un
    # ancestro) en vez de la de este nodo.
    registro = obtener_rol_local_en_proyecto(db, usuario_id, proyecto_id)
    if not registro:
        raise HTTPException(status_code=404, detail="El usuario no pertenece a este tema")

    db.delete(registro)

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


def crear_proyecto(
    db: Session,
    usuario: Usuario,
    nombre: str,
    descripcion: str | None,
    parent_id: int | None = None,
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
    if parent_id is not None:
        rol_padre = requerir_participacion_en_proyecto(db, usuario, parent_id)
        requerir_rol_minimo(rol_padre, [RolEnum.N1, RolEnum.N2])
        obtener_proyecto_o_404(db, parent_id)

        nuevo = Proyecto(nombre=nombre, descripcion=descripcion, parent_id=parent_id)
        db.add(nuevo)
        db.flush()
        db.add(
            UsuarioProyectoRol(
                usuario_id=usuario.id, proyecto_id=nuevo.id, rol=rol_padre.rol, supervisor_id=None
            )
        )
        return nuevo

    nuevo = Proyecto(nombre=nombre, descripcion=descripcion)
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


def actualizar_proyecto(db: Session, usuario: Usuario, proyecto_id: int, campos: dict) -> Proyecto:
    rol = requerir_participacion_en_proyecto(db, usuario, proyecto_id)
    requerir_rol_minimo(rol, [RolEnum.N1, RolEnum.N2])

    proyecto = obtener_proyecto_o_404(db, proyecto_id)
    for campo, valor in campos.items():
        if valor is not None:
            setattr(proyecto, campo, valor)
    return proyecto


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


def listar_equipo_visible(db: Session, usuario: Usuario, proyecto_id: int) -> list[MiembroEquipoOut]:
    """
    Lista el equipo del proyecto, respetando visibilidad:
    - N1: ve a todos.
    - N2: ve a su equipo (los que supervisa) + él mismo.
    - N3/N4: se ven solo a sí mismos.
    """
    rol = requerir_participacion_en_proyecto(db, usuario, proyecto_id)

    query = db.query(UsuarioProyectoRol).filter(UsuarioProyectoRol.proyecto_id == proyecto_id)

    if rol.rol == RolEnum.N1:
        registros = query.all()
    elif rol.rol == RolEnum.N2:
        registros = query.filter(
            (UsuarioProyectoRol.supervisor_id == usuario.id)
            | (UsuarioProyectoRol.usuario_id == usuario.id)
        ).all()
    else:
        registros = query.filter(UsuarioProyectoRol.usuario_id == usuario.id).all()

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

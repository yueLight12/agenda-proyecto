"""
Reglas centrales de permisos y visibilidad.

Este módulo es la implementación directa de la sección 4 del documento de
diseño (reglas de visibilidad). TODAS las consultas de entregables y equipo
deben pasar por aquí para no duplicar/desalinear la lógica de permisos.

Generalización 2026-08-16 a árbol de temas/subtemas (Proyecto.parent_id,
ver app/services/arbol_proyectos.py): el rol efectivo de un usuario en un
nodo se resuelve caminando la cadena de ancestros de ese nodo (él mismo
primero) hasta encontrar la primera fila EXPLÍCITA de UsuarioProyectoRol.
Si esa fila vive en el nodo exacto consultado ("local"), el comportamiento
es IDÉNTICO al de antes de este cambio -- para cualquiera de los proyectos
reales existentes (todos raíz, sin hijos) la cadena de ancestros de
cualquier nodo consultado es solo [ese nodo], así que SIEMPRE cae en el
caso local, byte por byte el comportamiento anterior. Si la fila viene de
un ancestro estricto ("heredada"), un N1/N2 ahí ve/administra TODO el
subárbol del nodo consultado sin restricción (quien lidera un tema
administra todo lo que cuelga debajo); un N3/N4 heredado sigue con el
mismo filtro restringido (propio o no sensible), sin volverse dueño de
nada. "Compartir un tema/subtema" con alguien es, con este modelo, crear
una fila UsuarioProyectoRol nueva en ESE nodo específico (ver
app/services/proyectos.py) -- no hace falta ningún mecanismo aparte.
"""
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.entregable import Entregable
from app.models.reunion import Reunion, ReunionParticipante
from app.models.usuario import RolEnum, Usuario
from app.models.usuario_proyecto_rol import UsuarioProyectoRol
from app.services import arbol_proyectos


def obtener_rol_en_proyecto(
    db: Session, usuario_id: int, proyecto_id: int
) -> Optional[UsuarioProyectoRol]:
    """Devuelve la fila de rol EXPLÍCITA más cercana del usuario, caminando
    la cadena de ancestros de proyecto_id (él mismo primero). None si no
    hay ninguna fila en toda la cadena (no participa ni ahí ni en ningún
    ancestro). El `.proyecto_id` de la fila devuelta puede ser distinto del
    `proyecto_id` consultado si la fila es heredada -- los llamadores que
    necesitan distinguir local vs. heredado comparan ambos valores (ver
    query_entregables_visibles)."""
    indice = arbol_proyectos.cargar_indice(db)
    cadena = arbol_proyectos.cadena_ancestros(indice, proyecto_id)
    filas_por_nodo = {
        r.proyecto_id: r
        for r in db.query(UsuarioProyectoRol)
        .filter(
            UsuarioProyectoRol.usuario_id == usuario_id,
            UsuarioProyectoRol.proyecto_id.in_(cadena),
        )
        .all()
    }
    for nodo_id in cadena:
        if nodo_id in filas_por_nodo:
            return filas_por_nodo[nodo_id]
    return None


def obtener_rol_local_en_proyecto(
    db: Session, usuario_id: int, proyecto_id: int
) -> Optional[UsuarioProyectoRol]:
    """Como obtener_rol_en_proyecto, pero SIN caminar ancestros -- solo la
    fila explícita exacta en proyecto_id, o None. Existe aparte a propósito
    para los lugares que CREAN/MODIFICAN/BORRAN una fila puntual
    (asignar_rol_en_proyecto, quitar_miembro_de_proyecto): usar la versión
    con herencia ahí sería un bug real -- podría devolver la fila de un
    ANCESTRO (ej. la de Bernardo en la raíz) y terminar reescribiendo o
    borrando el rol de otra persona en otro nodo por error, en vez de crear
    o quitar la fila local que se pidió."""
    return (
        db.query(UsuarioProyectoRol)
        .filter(
            UsuarioProyectoRol.usuario_id == usuario_id,
            UsuarioProyectoRol.proyecto_id == proyecto_id,
        )
        .first()
    )


def resolver_jefes_directos(db: Session, usuario_id: int) -> list[Usuario]:
    """Para el checklist 1:1 ascendente de Vista Equipo: quién es el/los
    jefe(s) directos de este usuario.
      - N3/N4: su supervisor_id explícito EN ESE proyecto (ya es la fuente
        de verdad, ver UsuarioProyectoRol.supervisor_id).
      - N2: el N1 EXPLÍCITO LOCAL del MISMO proyecto_id (sin caminar
        herencia -- misma convención "local" que supervisor_id). Si es N2
        en temas con N1 local distinto, devuelve más de una persona (jefe
        matricial legítimo) -- no se colapsa a una sola. Si un tema tiene
        más de una fila N1 explícita (caso raro, co-dirección), se toma la
        primera -- simplificación aceptada, no es el caso normal.
      - N1: lista vacía (nadie por encima en este sistema).
    Dedupe por usuario_id. NO es una regla de visibilidad -- no filtra lo
    que el llamador puede ver, solo resuelve identidad."""
    filas = db.query(UsuarioProyectoRol).filter(UsuarioProyectoRol.usuario_id == usuario_id).all()
    jefes: dict[int, Usuario] = {}
    for fila in filas:
        if fila.rol in (RolEnum.N3, RolEnum.N4):
            if fila.supervisor_id and fila.supervisor_id not in jefes:
                jefes[fila.supervisor_id] = fila.supervisor
        elif fila.rol == RolEnum.N2:
            n1_local = (
                db.query(UsuarioProyectoRol)
                .filter(
                    UsuarioProyectoRol.proyecto_id == fila.proyecto_id,
                    UsuarioProyectoRol.rol == RolEnum.N1,
                )
                .first()
            )
            if n1_local and n1_local.usuario_id not in jefes:
                jefes[n1_local.usuario_id] = n1_local.usuario
    return list(jefes.values())


def proyectos_del_par_jefe_reporte(db: Session, reporte_id: int, jefe_id: int) -> list[int]:
    """De qué temas sale la relación de jefe directo entre ESTAS DOS
    personas específicas -- N3/N4: los temas donde jefe_id es su
    supervisor_id explícito. N2: los temas donde jefe_id es el N1 LOCAL
    (mismo criterio "local" que resolver_jefes_directos). Movido aquí
    2026-08-18 (antes vivía como función privada en
    routers/equipo_resumen.py) para poder reutilizarlo también al filtrar
    qué temas ofrecer en el checklist de una junta (ver
    temas_relevantes_para_participantes) -- no otorga visibilidad nueva."""
    filas = db.query(UsuarioProyectoRol).filter(UsuarioProyectoRol.usuario_id == reporte_id).all()
    ids = []
    for fila in filas:
        if fila.rol in (RolEnum.N3, RolEnum.N4):
            if fila.supervisor_id == jefe_id:
                ids.append(fila.proyecto_id)
        elif fila.rol == RolEnum.N2:
            n1_local = (
                db.query(UsuarioProyectoRol)
                .filter(UsuarioProyectoRol.proyecto_id == fila.proyecto_id, UsuarioProyectoRol.rol == RolEnum.N1)
                .first()
            )
            if n1_local and n1_local.usuario_id == jefe_id:
                ids.append(fila.proyecto_id)
    return ids


def temas_relevantes_para_participantes(db: Session, participantes_ids: list[int]) -> set[int]:
    """proyecto_id de los temas "de" esta junta según quién la organiza y
    quién está invitado -- 2026-08-18, a petición de Yue: "si es entre
    Diana y Bernardo, solo deberían aparecer los temas que tienen Diana y
    Bernardo" (no TODO lo que Bernardo puede ver, que como Dirección global
    es prácticamente todo el árbol).

    Usa la misma relación jefe-directo ya construida para la "caja del
    jefe" de Vista Equipo (proyectos_del_par_jefe_reporte), en ambas
    direcciones para cada par de participantes -- así cubre tanto "Diana
    organiza e invita a su jefe Bernardo" como "Bernardo organiza e invita
    a su reporte Diana". Incluye también el subárbol completo de cada tema
    encontrado (si Diana tiene el rol en la raíz "Despachos", sus subtemas
    entran también, aunque ella no tenga una fila explícita ahí).

    Límite conocido, aceptado a propósito: dos participantes SIN relación
    jefe-subordinado entre sí (ej. dos colegas del mismo nivel en el mismo
    tema) no aportan temas por esta vía -- no es el caso que motivó este
    cambio; antes tampoco había ningún filtrado deliberado.
    """
    ids: set[int] = set()
    indice = arbol_proyectos.cargar_indice(db)
    for a in participantes_ids:
        for b in participantes_ids:
            if a == b:
                continue
            for pid in proyectos_del_par_jefe_reporte(db, a, b):
                ids |= arbol_proyectos.ids_subarbol(indice, pid)
    return ids


def requerir_participacion_en_proyecto(
    db: Session, usuario: Usuario, proyecto_id: int
) -> UsuarioProyectoRol:
    """
    Lanza 403 si el usuario no tiene ningún rol asignado en el proyecto.

    Un super admin (`usuario.es_super_admin`) siempre "participa" como N1 en
    cualquier proyecto, aunque no tenga una fila en usuario_proyecto_rol —
    así tiene control total automático incluso en proyectos creados después
    de volverse super admin, sin tener que asignarlo a mano cada vez.
    """
    if usuario.es_super_admin:
        return UsuarioProyectoRol(
            usuario_id=usuario.id, proyecto_id=proyecto_id, rol=RolEnum.N1
        )

    rol = obtener_rol_en_proyecto(db, usuario.id, proyecto_id)
    if rol is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes acceso a este tema",
        )
    return rol


def requerir_rol_minimo(rol_actual: UsuarioProyectoRol, roles_permitidos: list[RolEnum]):
    """Lanza 403 si el rol del usuario en el proyecto no está en la lista permitida."""
    if rol_actual.rol not in roles_permitidos:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos suficientes para esta acción en este tema",
        )


def query_entregables_visibles(
    db: Session, usuario: Usuario, proyecto_id: int
):
    """
    Implementa la sección 4 del documento de diseño, ahora sobre el
    SUBÁRBOL de proyecto_id (él mismo + todos sus descendientes, a
    cualquier profundidad):

    - N1 (local o heredado de un ancestro): ve TODOS los entregables del subárbol.
    - N2 heredado (lidera un ancestro estricto): igual que N1 -- quien
      lidera un tema ve todo lo que cuelga debajo, sin filtro de equipo.
    - N2 local (su fila vive exactamente en proyecto_id): en ESE nodo
      exacto, solo su equipo (supervisor_id == usuario.id) + él mismo,
      INCLUYENDO sensibles de su propio equipo -- igual que antes de la
      jerarquía. En cualquier descendiente de proyecto_id, sin filtrar
      (cascada de liderazgo: sigue siendo su territorio más abajo).
    - N3/N4 (local o heredado): solo sus propios entregables, o no
      sensibles, en todo el subárbol.

    Devuelve un Query de SQLAlchemy ya filtrado (no ejecutado), listo para
    aplicar .all(), paginación, etc.
    """
    rol = requerir_participacion_en_proyecto(db, usuario, proyecto_id)
    indice = arbol_proyectos.cargar_indice(db)
    ids_subtree = arbol_proyectos.ids_subarbol(indice, proyecto_id)
    base_query = db.query(Entregable).filter(Entregable.proyecto_id.in_(ids_subtree))

    heredado = rol.proyecto_id != proyecto_id

    if rol.rol == RolEnum.N1 or (rol.rol == RolEnum.N2 and heredado):
        return base_query

    if rol.rol == RolEnum.N2:
        # Local: equipo directo de ESTE nodo (supervisor_id == usuario.id
        # EN proyecto_id) + entregables de CUALQUIER descendiente, sin filtrar.
        ids_equipo = [
            r.usuario_id
            for r in db.query(UsuarioProyectoRol)
            .filter(
                UsuarioProyectoRol.proyecto_id == proyecto_id,
                UsuarioProyectoRol.supervisor_id == usuario.id,
            )
            .all()
        ]
        ids_equipo.append(usuario.id)
        ids_descendientes = ids_subtree - {proyecto_id}
        return base_query.filter(
            or_(
                Entregable.responsable_id.in_(ids_equipo),
                Entregable.proyecto_id.in_(ids_descendientes),
            )
        )

    # N3 / N4 (local o heredado)
    return base_query.filter(
        or_(
            Entregable.responsable_id == usuario.id,
            Entregable.sensible.is_(False),
        )
    )


def puede_ver_entregable(db: Session, usuario: Usuario, entregable: Entregable) -> bool:
    """Valida si un usuario puede ver un entregable puntual (para GET /entregables/{id})."""
    ids_visibles = {
        e.id
        for e in query_entregables_visibles(db, usuario, entregable.proyecto_id).all()
    }
    return entregable.id in ids_visibles


def puede_editar_entregable(db: Session, usuario: Usuario, entregable: Entregable) -> bool:
    """
    N1/N2 (de ese proyecto) pueden editar cualquier campo.
    El propio responsable puede editar (usado principalmente para actualizar avance).
    """
    if usuario.es_super_admin:
        return True
    rol = obtener_rol_en_proyecto(db, usuario.id, entregable.proyecto_id)
    if rol is None:
        return False
    if rol.rol in (RolEnum.N1, RolEnum.N2):
        return True
    return entregable.responsable_id == usuario.id


# Alias semántico de puede_editar_entregable (2026-08-20, a petición del
# cliente: "si alguien te asignó algo que no te pertenece, poder
# reasignarlo") -- MISMO criterio (N1/N2 del proyecto, o el propio
# responsable actual), sin regla de permisos nueva. Nombre propio para que
# el llamador (reasignar_entregable en services/entregables.py) exprese la
# intención sin acoplarse a un nombre pensado originalmente para "editar
# cualquier campo".
def puede_reasignar_entregable(db: Session, usuario: Usuario, entregable: Entregable) -> bool:
    return puede_editar_entregable(db, usuario, entregable)


def query_reuniones_visibles(db: Session, usuario: Usuario, proyecto_id: int):
    """
    Regla de visibilidad de reuniones (distinta a la de entregables, sin
    cambios de asimetría al generalizar a árbol -- N2 nunca tuvo aquí un
    "ve todo su equipo" como sí tiene en entregables):

    - N1 (local o heredado de un ancestro): ve TODAS las reuniones del
      SUBÁRBOL de proyecto_id (él mismo + todos sus descendientes).
    - Resto de roles (incluido N2, local o heredado): solo ve las
      reuniones donde participa, como organizador o como invitado —
      "solo visible para los involucrados", en todo el subárbol.

    Devuelve un Query de SQLAlchemy ya filtrado, listo para .all()/paginación.
    Reuniones "generales" (proyecto_id NULL, sin tema) NO pasan por aquí --
    ver query_reuniones_generales_visibles.
    """
    rol = requerir_participacion_en_proyecto(db, usuario, proyecto_id)
    indice = arbol_proyectos.cargar_indice(db)
    ids_subtree = arbol_proyectos.ids_subarbol(indice, proyecto_id)
    base_query = db.query(Reunion).filter(Reunion.proyecto_id.in_(ids_subtree))

    if rol.rol == RolEnum.N1:
        return base_query

    ids_reuniones_invitado = [
        rp.reunion_id
        for rp in db.query(ReunionParticipante)
        .filter(ReunionParticipante.usuario_id == usuario.id)
        .all()
    ]
    return base_query.filter(
        or_(
            Reunion.organizador_id == usuario.id,
            Reunion.id.in_(ids_reuniones_invitado),
        )
    )


def query_reuniones_generales_visibles(db: Session, usuario: Usuario):
    """Reuniones "generales" (proyecto_id NULL, sin tema/proyecto -- pedido
    explícito del cliente 2026-08-16, pendiente desde 2026-08-10). Nadie es
    "N1 de nada" aquí, así que aplica sin excepción organizador-o-invitado
    (misma rama que ya existe para "no soy N1" arriba, sin lógica nueva).
    Un super_admin tampoco tiene una noción especial aquí -- una reunión
    general es, por definición, solo de quienes la organizan/asisten."""
    ids_reuniones_invitado = [
        rp.reunion_id
        for rp in db.query(ReunionParticipante)
        .filter(ReunionParticipante.usuario_id == usuario.id)
        .all()
    ]
    return db.query(Reunion).filter(
        Reunion.proyecto_id.is_(None),
        or_(
            Reunion.organizador_id == usuario.id,
            Reunion.id.in_(ids_reuniones_invitado),
        ),
    )


def puede_ver_reunion(db: Session, usuario: Usuario, reunion: Reunion) -> bool:
    """Valida si un usuario puede ver una reunión puntual (para GET /reuniones/{id})."""
    if reunion.proyecto_id is None:
        ids_visibles = {r.id for r in query_reuniones_generales_visibles(db, usuario).all()}
        return reunion.id in ids_visibles
    ids_visibles = {
        r.id for r in query_reuniones_visibles(db, usuario, reunion.proyecto_id).all()
    }
    return reunion.id in ids_visibles


def puede_editar_reunion(db: Session, usuario: Usuario, reunion: Reunion) -> bool:
    """N1/N2 (local o heredado) del proyecto/tema pueden editar cualquier
    reunión de su subárbol; el organizador puede editar la suya. Una
    reunión general (proyecto_id None) no tiene N1/N2 posible -- 2026-08-18,
    a petición de Yue: CUALQUIER invitado puede editar/reagendar/cancelar
    una reunión general, no solo el organizador (antes solo aplicaba a las
    juntas 1:1; se amplió a cualquier reunión general). Agregar ítems al
    checklist de una SERIE sigue siendo solo del organizador, sin cambios
    ahí -- ver puede_editar_serie en series_reunion.py."""
    if usuario.es_super_admin:
        return True
    if reunion.proyecto_id is None:
        if reunion.organizador_id == usuario.id:
            return True
        return any(p.usuario_id == usuario.id for p in reunion.participantes)
    rol = obtener_rol_en_proyecto(db, usuario.id, reunion.proyecto_id)
    if rol is None:
        return False
    if rol.rol in (RolEnum.N1, RolEnum.N2):
        return True
    return reunion.organizador_id == usuario.id


def puede_editar_minuta(db: Session, usuario: Usuario, reunion: Reunion) -> bool:
    """
    Regla propia para la minuta (distinta de puede_editar_reunion): además
    de N1/N2 del proyecto o el organizador, CUALQUIER invitado de la
    reunión puede crear/editar su minuta y sus acuerdos — la reunión en sí
    (título/fecha/participantes) sigue solo en manos de N1/N2/organizador,
    sin cambios ahí. Acordado explícitamente con Yue el 2026-08-14: un
    invitado solo de retroalimentación/oyente (ej. N4 en un proyecto donde
    no es responsable de nada) igual puede dejar notas de lo que se habló.
    """
    if puede_editar_reunion(db, usuario, reunion):
        return True
    return any(p.usuario_id == usuario.id for p in reunion.participantes)

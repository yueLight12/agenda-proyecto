"""
Reglas centrales de permisos y visibilidad.

Este módulo es la implementación directa de la sección 4 del documento de
diseño (reglas de visibilidad). TODAS las consultas de entregables y equipo
deben pasar por aquí para no duplicar/desalinear la lógica de permisos.
"""
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.entregable import Entregable
from app.models.reunion import Reunion, ReunionParticipante
from app.models.usuario import RolEnum, Usuario
from app.models.usuario_proyecto_rol import UsuarioProyectoRol


def obtener_rol_en_proyecto(
    db: Session, usuario_id: int, proyecto_id: int
) -> Optional[UsuarioProyectoRol]:
    """Devuelve el registro de rol del usuario en ese proyecto, o None si no participa."""
    return (
        db.query(UsuarioProyectoRol)
        .filter(
            UsuarioProyectoRol.usuario_id == usuario_id,
            UsuarioProyectoRol.proyecto_id == proyecto_id,
        )
        .first()
    )


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
            detail="No tienes acceso a este proyecto",
        )
    return rol


def requerir_rol_minimo(rol_actual: UsuarioProyectoRol, roles_permitidos: list[RolEnum]):
    """Lanza 403 si el rol del usuario en el proyecto no está en la lista permitida."""
    if rol_actual.rol not in roles_permitidos:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos suficientes para esta acción en este proyecto",
        )


def query_entregables_visibles(
    db: Session, usuario: Usuario, proyecto_id: int
):
    """
    Implementa la sección 4 del documento de diseño:

    - N1: ve TODOS los entregables del proyecto.
    - N2: ve entregables de su equipo (supervisor_id == usuario.id) o propios,
          INCLUYENDO sensibles de su propio equipo.
    - N3/N4: ve solo sus propios entregables, o entregables no sensibles del proyecto.

    Devuelve un Query de SQLAlchemy ya filtrado (no ejecutado), listo para
    aplicar .all(), paginación, etc.
    """
    rol = requerir_participacion_en_proyecto(db, usuario, proyecto_id)
    base_query = db.query(Entregable).filter(Entregable.proyecto_id == proyecto_id)

    if rol.rol == RolEnum.N1:
        return base_query

    if rol.rol == RolEnum.N2:
        # IDs de los usuarios que este N2 supervisa en este proyecto
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
        return base_query.filter(Entregable.responsable_id.in_(ids_equipo))

    # N3 / N4
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


def query_reuniones_visibles(db: Session, usuario: Usuario, proyecto_id: int):
    """
    Regla de visibilidad de reuniones (distinta a la de entregables):

    - N1: ve TODAS las reuniones del proyecto (misma lógica de dirección que
      con entregables).
    - Resto de roles: solo ve las reuniones donde participa, como organizador
      o como invitado — "solo visible para los involucrados".

    Devuelve un Query de SQLAlchemy ya filtrado, listo para .all()/paginación.
    """
    rol = requerir_participacion_en_proyecto(db, usuario, proyecto_id)
    base_query = db.query(Reunion).filter(Reunion.proyecto_id == proyecto_id)

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


def puede_ver_reunion(db: Session, usuario: Usuario, reunion: Reunion) -> bool:
    """Valida si un usuario puede ver una reunión puntual (para GET /reuniones/{id})."""
    ids_visibles = {
        r.id for r in query_reuniones_visibles(db, usuario, reunion.proyecto_id).all()
    }
    return reunion.id in ids_visibles


def puede_editar_reunion(db: Session, usuario: Usuario, reunion: Reunion) -> bool:
    """N1/N2 del proyecto pueden editar cualquier reunión; el organizador puede editar la suya."""
    if usuario.es_super_admin:
        return True
    rol = obtener_rol_en_proyecto(db, usuario.id, reunion.proyecto_id)
    if rol is None:
        return False
    if rol.rol in (RolEnum.N1, RolEnum.N2):
        return True
    return reunion.organizador_id == usuario.id

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
    requerir_participacion_en_proyecto,
    requerir_rol_minimo,
)
from app.models.entregable import Entregable
from app.models.notificacion import Notificacion
from app.models.proyecto import Proyecto
from app.models.usuario import RolEnum, Usuario
from app.models.usuario_proyecto_rol import UsuarioProyectoRol
from app.schemas.proyecto import MiembroEquipoOut


def obtener_proyecto_o_404(db: Session, proyecto_id: int) -> Proyecto:
    proyecto = db.query(Proyecto).filter(Proyecto.id == proyecto_id).first()
    if not proyecto:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    return proyecto


def listar_proyectos_visibles(db: Session, usuario: Usuario) -> list[Proyecto]:
    """Un super admin ve TODOS los proyectos, incluso sin fila en usuario_proyecto_rol."""
    if usuario.es_super_admin:
        return db.query(Proyecto).all()

    proyecto_ids = [
        r.proyecto_id
        for r in db.query(UsuarioProyectoRol)
        .filter(UsuarioProyectoRol.usuario_id == usuario.id)
        .all()
    ]
    return db.query(Proyecto).filter(Proyecto.id.in_(proyecto_ids)).all()


def crear_proyecto(db: Session, usuario: Usuario, nombre: str, descripcion: str | None) -> Proyecto:
    """Cualquier usuario autenticado puede crear un proyecto; queda como N1 de él."""
    nuevo = Proyecto(nombre=nombre, descripcion=descripcion)
    db.add(nuevo)
    db.flush()

    db.add(UsuarioProyectoRol(usuario_id=usuario.id, proyecto_id=nuevo.id, rol=RolEnum.N1))
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
    """Elimina el proyecto y todo lo que cuelga de él (equipo, entregables, reuniones). Requiere N1."""
    rol = requerir_participacion_en_proyecto(db, usuario, proyecto_id)
    requerir_rol_minimo(rol, [RolEnum.N1])

    proyecto = obtener_proyecto_o_404(db, proyecto_id)

    entregable_ids = [
        e.id for e in db.query(Entregable).filter(Entregable.proyecto_id == proyecto_id).all()
    ]
    if entregable_ids:
        db.query(Notificacion).filter(Notificacion.entregable_id.in_(entregable_ids)).delete(
            synchronize_session=False
        )

    db.delete(proyecto)


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
    Asigna (o reasigna) el rol de un usuario dentro de un proyecto. Requiere N1 o N2.

    Para N3/N4, si no se manda supervisor_id, queda como supervisor quien está
    haciendo la asignación (sea N1 o N2) — así alguien que es N1 de un proyecto
    recién creado puede agregar colaboradores sin tener que nombrar antes a un N2.
    """
    rol_actual = requerir_participacion_en_proyecto(db, usuario, proyecto_id)
    requerir_rol_minimo(rol_actual, [RolEnum.N1, RolEnum.N2])

    if rol in (RolEnum.N3, RolEnum.N4) and supervisor_id is None:
        supervisor_id = usuario.id

    existente = obtener_rol_en_proyecto(db, usuario_id, proyecto_id)
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
    """Quita a un usuario del proyecto (elimina su rol). Requiere N1 o N2."""
    rol_actual = requerir_participacion_en_proyecto(db, usuario, proyecto_id)
    requerir_rol_minimo(rol_actual, [RolEnum.N1, RolEnum.N2])

    registro = obtener_rol_en_proyecto(db, usuario_id, proyecto_id)
    if not registro:
        raise HTTPException(status_code=404, detail="El usuario no pertenece a este proyecto")

    db.delete(registro)

"""
Servicio de pendientes reutilizables: crear, listar y eliminar pendientes
sobre un proyecto/tema. Mismo criterio de permisos que la rama proyecto_id
de app/services/notas.py -- ver un pendiente requiere participar en el
tema; editar/borrar requiere ser el autor o tener rol N1/N2 local (o super
admin), sin inventar una regla nueva.
"""
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.permissions import obtener_rol_en_proyecto, requerir_participacion_en_proyecto
from app.models.pendiente import Pendiente
from app.models.usuario import RolEnum, Usuario
from app.schemas.pendiente import PendienteCrear, PendienteOut
from app.services.proyectos import obtener_proyecto_o_404


def pendiente_a_out(pendiente: Pendiente) -> PendienteOut:
    return PendienteOut(
        id=pendiente.id,
        proyecto_id=pendiente.proyecto_id,
        contenido=pendiente.contenido,
        autor_id=pendiente.autor_id,
        autor_nombre=pendiente.autor.nombre,
        fecha_creacion=pendiente.fecha_creacion,
    )


def _puede_editar_pendiente(db: Session, usuario: Usuario, pendiente: Pendiente) -> bool:
    if usuario.es_super_admin:
        return True
    fila = obtener_rol_en_proyecto(db, usuario.id, pendiente.proyecto_id)
    return fila is not None and fila.rol in (RolEnum.N1, RolEnum.N2)


def listar_pendientes(db: Session, usuario: Usuario, proyecto_id: int) -> list[Pendiente]:
    obtener_proyecto_o_404(db, proyecto_id)
    requerir_participacion_en_proyecto(db, usuario, proyecto_id)
    return (
        db.query(Pendiente)
        .filter(Pendiente.proyecto_id == proyecto_id)
        .order_by(Pendiente.fecha_creacion.asc())
        .all()
    )


def crear_pendiente(db: Session, usuario: Usuario, datos: PendienteCrear) -> Pendiente:
    obtener_proyecto_o_404(db, datos.proyecto_id)
    requerir_participacion_en_proyecto(db, usuario, datos.proyecto_id)
    pendiente = Pendiente(
        proyecto_id=datos.proyecto_id,
        contenido=datos.contenido,
        autor_id=usuario.id,
    )
    db.add(pendiente)
    db.flush()
    return pendiente


def eliminar_pendiente(db: Session, usuario: Usuario, pendiente_id: int) -> None:
    pendiente = db.query(Pendiente).filter(Pendiente.id == pendiente_id).first()
    if not pendiente:
        raise HTTPException(status_code=404, detail="Pendiente no encontrado")
    es_autor = pendiente.autor_id == usuario.id
    if not es_autor and not _puede_editar_pendiente(db, usuario, pendiente):
        raise HTTPException(status_code=403, detail="No tienes permiso para eliminar este pendiente")
    db.delete(pendiente)

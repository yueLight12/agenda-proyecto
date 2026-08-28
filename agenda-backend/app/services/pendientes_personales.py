"""
Servicio de pendientes personales: checklist 100% privado de cada usuario
(ver app/models/pendiente_personal.py). El único criterio de acceso es ser
el dueño (`usuario_id == usuario.id`) -- no hay rol N1-N4 ni proyecto de
por medio, así que este módulo NO importa nada de app/core/permissions.py
a propósito.
"""
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.pendiente_personal import PendientePersonal
from app.models.usuario import Usuario
from app.schemas.pendiente_personal import PendientePersonalActualizar, PendientePersonalCrear


def _obtener_propio_o_404(db: Session, usuario: Usuario, pendiente_id: int) -> PendientePersonal:
    pendiente = (
        db.query(PendientePersonal)
        .filter(PendientePersonal.id == pendiente_id, PendientePersonal.usuario_id == usuario.id)
        .first()
    )
    if pendiente is None:
        # 404, no 403 -- no se revela si existe una fila con ese id que sea
        # de alguien más, mismo criterio de discreción que el resto del
        # sistema con lo que no le toca ver a quien pregunta.
        raise HTTPException(status_code=404, detail="Pendiente personal no encontrado")
    return pendiente


def listar_pendientes_personales(db: Session, usuario: Usuario) -> list[PendientePersonal]:
    return (
        db.query(PendientePersonal)
        .filter(PendientePersonal.usuario_id == usuario.id)
        .order_by(PendientePersonal.hecho.asc(), PendientePersonal.fecha_creacion.desc())
        .all()
    )


def crear_pendiente_personal(
    db: Session, usuario: Usuario, datos: PendientePersonalCrear
) -> PendientePersonal:
    pendiente = PendientePersonal(
        usuario_id=usuario.id,
        contenido=datos.contenido,
        fecha_limite=datos.fecha_limite,
    )
    db.add(pendiente)
    db.flush()
    return pendiente


def actualizar_pendiente_personal(
    db: Session, usuario: Usuario, pendiente_id: int, datos: PendientePersonalActualizar
) -> PendientePersonal:
    pendiente = _obtener_propio_o_404(db, usuario, pendiente_id)
    if datos.contenido is not None:
        pendiente.contenido = datos.contenido
    if datos.fecha_limite is not None:
        pendiente.fecha_limite = datos.fecha_limite
    if datos.hecho is not None:
        pendiente.hecho = datos.hecho
    db.flush()
    return pendiente


def eliminar_pendiente_personal(db: Session, usuario: Usuario, pendiente_id: int) -> None:
    pendiente = _obtener_propio_o_404(db, usuario, pendiente_id)
    db.delete(pendiente)

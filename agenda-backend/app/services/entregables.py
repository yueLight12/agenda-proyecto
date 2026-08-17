"""
Servicio de entregables: crear, editar y actualizar avance. Usado por los
routers REST (app/routers/entregables.py, app/routers/minutas.py) y por el
asistente de voz (app/services/asistente/), para no duplicar reglas de
permisos ni notificaciones entre ambos caminos.
"""
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.permissions import (
    obtener_rol_en_proyecto,
    puede_editar_entregable,
    requerir_participacion_en_proyecto,
    requerir_rol_minimo,
)
from app.models.entregable import Entregable, EstatusEntregable
from app.models.historial_avance import HistorialAvance
from app.models.minuta import AcuerdoMinuta
from app.models.notificacion import Notificacion, TipoNotificacion
from app.models.usuario import RolEnum, Usuario
from app.models.usuario_proyecto_rol import UsuarioProyectoRol
from app.schemas.entregable import EntregableOut


def entregable_a_out(db: Session, usuario: Usuario, entregable: Entregable) -> EntregableOut:
    return EntregableOut(
        id=entregable.id,
        proyecto_id=entregable.proyecto_id,
        nombre=entregable.nombre,
        descripcion=entregable.descripcion,
        responsable_id=entregable.responsable_id,
        fecha_entrega=entregable.fecha_entrega,
        sensible=entregable.sensible,
        porcentaje_avance=entregable.porcentaje_avance,
        estatus=entregable.estatus,
        creado_por=entregable.creado_por,
        fecha_creacion=entregable.fecha_creacion,
        puede_editar=puede_editar_entregable(db, usuario, entregable),
    )


def crear_entregable(
    db: Session,
    proyecto_id: int,
    usuario: Usuario,
    rol: UsuarioProyectoRol,
    nombre: str,
    descripcion: str | None,
    responsable_id: int,
    fecha_entrega,
    sensible: bool,
) -> Entregable:
    """
    N1/N2 pueden crear y asignar a cualquiera de su equipo. N3/N4 solo pueden
    autoasignarse (responsable_id == usuario.id). Notifica al responsable si
    lo asigna un líder, o al supervisor si es autoasignación.
    """
    es_lider = rol.rol in (RolEnum.N1, RolEnum.N2)
    if not es_lider and responsable_id != usuario.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo puedes crear entregables asignados a ti mismo",
        )

    nuevo = Entregable(
        proyecto_id=proyecto_id,
        nombre=nombre,
        descripcion=descripcion,
        responsable_id=responsable_id,
        fecha_entrega=fecha_entrega,
        sensible=sensible,
        creado_por=usuario.id,
    )
    db.add(nuevo)
    db.flush()  # para tener nuevo.id antes de crear la notificación

    if es_lider and responsable_id != usuario.id:
        db.add(
            Notificacion(
                usuario_id=responsable_id,
                entregable_id=nuevo.id,
                tipo=TipoNotificacion.entregable_asignado,
                mensaje=f'Se te asignó un nuevo entregable: "{nuevo.nombre}" (fecha límite: {nuevo.fecha_entrega}).',
            )
        )
    elif not es_lider and rol.supervisor_id:
        db.add(
            Notificacion(
                usuario_id=rol.supervisor_id,
                entregable_id=nuevo.id,
                tipo=TipoNotificacion.entregable_asignado,
                mensaje=f'{usuario.nombre} se autoasignó un nuevo entregable: "{nuevo.nombre}".',
            )
        )

    return nuevo


def obtener_entregable_o_404(db: Session, entregable_id: int) -> Entregable:
    entregable = db.query(Entregable).filter(Entregable.id == entregable_id).first()
    if not entregable:
        raise HTTPException(status_code=404, detail="Entregable no encontrado")
    return entregable


def actualizar_entregable(
    db: Session, usuario: Usuario, entregable_id: int, campos: dict
) -> Entregable:
    """Edición general del entregable (nombre, fecha, responsable, etc). Requiere N1/N2."""
    entregable = obtener_entregable_o_404(db, entregable_id)

    rol = requerir_participacion_en_proyecto(db, usuario, entregable.proyecto_id)
    requerir_rol_minimo(rol, [RolEnum.N1, RolEnum.N2])

    for campo, valor in campos.items():
        setattr(entregable, campo, valor)

    return entregable


def eliminar_entregable(db: Session, usuario: Usuario, entregable_id: int) -> None:
    """
    Elimina un entregable. Requiere N1/N2, mismo gate que actualizar_entregable
    (no el propio responsable, para no perder trazabilidad de alguien
    borrando su propio pendiente).

    Historial de avance y notas cascadean solos (relaciones ORM en
    Entregable). Notificacion.entregable_id y AcuerdoMinuta.entregable_id son
    nullable y no cascadean por ORM — se limpian a mano: las notificaciones
    se borran (ya no tiene sentido notificar sobre algo que ya no existe),
    pero un acuerdo de minuta ya convertido en este entregable NO se borra,
    solo se desvincula (entregable_id = NULL) — el acuerdo en sí sigue siendo
    un registro válido de lo que se discutió en la reunión.
    """
    entregable = obtener_entregable_o_404(db, entregable_id)

    rol = requerir_participacion_en_proyecto(db, usuario, entregable.proyecto_id)
    requerir_rol_minimo(rol, [RolEnum.N1, RolEnum.N2])

    db.query(Notificacion).filter(Notificacion.entregable_id == entregable_id).delete(
        synchronize_session=False
    )
    db.query(AcuerdoMinuta).filter(AcuerdoMinuta.entregable_id == entregable_id).update(
        {AcuerdoMinuta.entregable_id: None}, synchronize_session=False
    )

    db.delete(entregable)


def actualizar_avance(
    db: Session, usuario: Usuario, entregable_id: int, porcentaje_avance: int
) -> Entregable:
    """
    Actualiza el % de avance de un entregable y guarda el registro en el
    historial (para poder comparar "antes vs. ahora"). El propio responsable
    puede hacerlo, además de N1/N2 del proyecto. Notifica al supervisor del
    responsable en cada actualización, y a quien creó el entregable si se
    completó (y es alguien distinto del supervisor ya notificado).
    """
    entregable = obtener_entregable_o_404(db, entregable_id)

    if not puede_editar_entregable(db, usuario, entregable):
        raise HTTPException(
            status_code=403, detail="No tienes permiso para actualizar este entregable"
        )

    entregable.porcentaje_avance = porcentaje_avance
    if porcentaje_avance >= 100:
        entregable.estatus = EstatusEntregable.cumplido
    elif porcentaje_avance > 0:
        entregable.estatus = EstatusEntregable.en_progreso
    else:
        entregable.estatus = EstatusEntregable.pendiente

    db.add(
        HistorialAvance(
            entregable_id=entregable.id,
            porcentaje_avance=porcentaje_avance,
            actualizado_por=usuario.id,
        )
    )

    rol_responsable = obtener_rol_en_proyecto(db, entregable.responsable_id, entregable.proyecto_id)
    supervisor_id = rol_responsable.supervisor_id if rol_responsable else None

    notificados = set()
    if supervisor_id and supervisor_id != usuario.id:
        if entregable.estatus == EstatusEntregable.cumplido:
            mensaje = f'{usuario.nombre} marcó como cumplido el entregable "{entregable.nombre}".'
        else:
            mensaje = (
                f'{usuario.nombre} actualizó el avance de "{entregable.nombre}" '
                f"a {porcentaje_avance}%."
            )
        db.add(
            Notificacion(
                usuario_id=supervisor_id,
                entregable_id=entregable.id,
                tipo=TipoNotificacion.avance_actualizado,
                mensaje=mensaje,
            )
        )
        notificados.add(supervisor_id)

    if (
        entregable.estatus == EstatusEntregable.cumplido
        and entregable.creado_por != usuario.id
        and entregable.creado_por not in notificados
    ):
        db.add(
            Notificacion(
                usuario_id=entregable.creado_por,
                entregable_id=entregable.id,
                tipo=TipoNotificacion.otro,
                mensaje=f'El entregable "{entregable.nombre}" fue marcado como cumplido.',
            )
        )

    return entregable

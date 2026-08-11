"""
Servicio de reuniones: crear, editar, eliminar y convertir a schema de
salida. Usado por el router REST (app/routers/reuniones.py) y por el
asistente de voz (app/services/asistente/), para no duplicar las reglas de
permisos (app.core.permissions) ni la construcción de ReunionOut.
"""
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.permissions import puede_editar_reunion, requerir_participacion_en_proyecto
from app.models.reunion import Reunion, ReunionParticipante
from app.models.usuario import Usuario
from app.schemas.reunion import ParticipanteOut, ReunionOut


def reunion_a_out(reunion: Reunion) -> ReunionOut:
    return ReunionOut(
        id=reunion.id,
        proyecto_id=reunion.proyecto_id,
        titulo=reunion.titulo,
        notas=reunion.notas,
        fecha_inicio=reunion.fecha_inicio,
        duracion_minutos=reunion.duracion_minutos,
        organizador_id=reunion.organizador_id,
        organizador_nombre=reunion.organizador.nombre,
        participantes=[
            ParticipanteOut(usuario_id=p.usuario_id, nombre=p.usuario.nombre)
            for p in reunion.participantes
        ],
    )


def obtener_reunion_o_404(db: Session, reunion_id: int) -> Reunion:
    reunion = db.query(Reunion).filter(Reunion.id == reunion_id).first()
    if not reunion:
        raise HTTPException(status_code=404, detail="Reunión no encontrada")
    return reunion


def crear_reunion(
    db: Session,
    usuario: Usuario,
    proyecto_id: int,
    titulo: str,
    notas: str | None,
    fecha_inicio,
    duracion_minutos: int,
    participantes_ids: list[int],
) -> Reunion:
    """
    Cualquier participante del proyecto puede agendar una reunión (no requiere
    N1/N2, a diferencia de los entregables): un N2 puede citar a otro N2 o al
    N1, por ejemplo. Queda visible solo para organizador + invitados (y N1).
    """
    requerir_participacion_en_proyecto(db, usuario, proyecto_id)

    nueva = Reunion(
        proyecto_id=proyecto_id,
        titulo=titulo,
        notas=notas,
        fecha_inicio=fecha_inicio,
        duracion_minutos=duracion_minutos,
        organizador_id=usuario.id,
    )
    db.add(nueva)
    db.flush()

    for uid in set(participantes_ids) - {usuario.id}:
        db.add(ReunionParticipante(reunion_id=nueva.id, usuario_id=uid))

    return nueva


def actualizar_reunion(db: Session, usuario: Usuario, reunion_id: int, campos: dict) -> Reunion:
    reunion = obtener_reunion_o_404(db, reunion_id)
    if not puede_editar_reunion(db, usuario, reunion):
        raise HTTPException(status_code=403, detail="No tienes permiso para editar esta reunión")

    participantes_ids = campos.pop("participantes_ids", None)

    for campo, valor in campos.items():
        setattr(reunion, campo, valor)

    if participantes_ids is not None:
        db.query(ReunionParticipante).filter(
            ReunionParticipante.reunion_id == reunion.id
        ).delete()
        for uid in set(participantes_ids) - {reunion.organizador_id}:
            db.add(ReunionParticipante(reunion_id=reunion.id, usuario_id=uid))

    return reunion


def eliminar_reunion(db: Session, usuario: Usuario, reunion_id: int) -> None:
    reunion = obtener_reunion_o_404(db, reunion_id)
    if not puede_editar_reunion(db, usuario, reunion):
        raise HTTPException(
            status_code=403, detail="No tienes permiso para eliminar esta reunión"
        )
    db.delete(reunion)

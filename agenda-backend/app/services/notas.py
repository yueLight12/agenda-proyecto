"""
Servicio de notas: crear, listar y eliminar notas sobre un entregable, una
reunión o una minuta.

Regla de visibilidad (igual que Minuta/AcuerdoMinuta con Reunion, ver
app/services/minutas.py): la nota NUNCA calcula su propio permiso. Se
resuelve el padre (entregable, reunión, o la reunión de la minuta) y se
delega en las funciones ya existentes de app.core.permissions. Crear una
nota requiere poder VER el padre; editar/borrar requiere ser el autor o
poder EDITAR el padre (N1/N2 del proyecto, o super admin — ya cubierto
dentro de puede_editar_entregable/puede_editar_reunion).

Al crear una nota se notifica (in-app, reutilizando Notificacion/
TipoNotificacion.otro — sin tipo ni columna nueva) a quien correspondería
enterarse: el responsable del entregable, o el organizador + invitados de
la reunión/minuta, excluyendo siempre al propio autor.
"""
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.permissions import (
    puede_editar_entregable,
    puede_editar_reunion,
    puede_ver_entregable,
    puede_ver_reunion,
)
from app.models.minuta import Minuta
from app.models.nota import Nota
from app.models.notificacion import Notificacion, TipoNotificacion
from app.models.usuario import Usuario
from app.schemas.nota import NotaCrear, NotaOut
from app.services.entregables import obtener_entregable_o_404
from app.services.reuniones import obtener_reunion_o_404


def nota_a_out(nota: Nota) -> NotaOut:
    return NotaOut(
        id=nota.id,
        entregable_id=nota.entregable_id,
        reunion_id=nota.reunion_id,
        minuta_id=nota.minuta_id,
        contenido=nota.contenido,
        autor_id=nota.autor_id,
        autor_nombre=nota.autor.nombre,
        fecha_creacion=nota.fecha_creacion,
    )


def _obtener_minuta_o_404(db: Session, minuta_id: int) -> Minuta:
    minuta = db.query(Minuta).filter(Minuta.id == minuta_id).first()
    if not minuta:
        raise HTTPException(status_code=404, detail="Minuta no encontrada")
    return minuta


def _puede_ver_padre(
    db: Session,
    usuario: Usuario,
    entregable_id: int | None,
    reunion_id: int | None,
    minuta_id: int | None,
) -> bool:
    if entregable_id is not None:
        entregable = obtener_entregable_o_404(db, entregable_id)
        return puede_ver_entregable(db, usuario, entregable)
    if reunion_id is not None:
        reunion = obtener_reunion_o_404(db, reunion_id)
        return puede_ver_reunion(db, usuario, reunion)
    minuta = _obtener_minuta_o_404(db, minuta_id)
    return puede_ver_reunion(db, usuario, minuta.reunion)


def _puede_editar_padre(db: Session, usuario: Usuario, nota: Nota) -> bool:
    if nota.entregable_id is not None:
        return puede_editar_entregable(db, usuario, nota.entregable)
    if nota.reunion_id is not None:
        return puede_editar_reunion(db, usuario, nota.reunion)
    return puede_editar_reunion(db, usuario, nota.minuta.reunion)


def listar_notas(
    db: Session,
    usuario: Usuario,
    entregable_id: int | None,
    reunion_id: int | None,
    minuta_id: int | None,
) -> list[Nota]:
    padres = [entregable_id, reunion_id, minuta_id]
    if sum(1 for p in padres if p is not None) != 1:
        raise HTTPException(
            status_code=400,
            detail="Debes indicar exactamente uno de: entregable_id, reunion_id o minuta_id",
        )

    if not _puede_ver_padre(db, usuario, entregable_id, reunion_id, minuta_id):
        raise HTTPException(status_code=403, detail="No tienes acceso a este contenido")

    query = db.query(Nota)
    if entregable_id is not None:
        query = query.filter(Nota.entregable_id == entregable_id)
    elif reunion_id is not None:
        query = query.filter(Nota.reunion_id == reunion_id)
    else:
        query = query.filter(Nota.minuta_id == minuta_id)
    return query.order_by(Nota.fecha_creacion.asc()).all()


def _notificar_nota_nueva(db: Session, usuario: Usuario, nota: Nota) -> None:
    if nota.entregable_id is not None:
        entregable = nota.entregable
        destinatarios = {entregable.responsable_id}
        mensaje = f'{usuario.nombre} agregó una nota en el entregable "{entregable.nombre}".'
        entregable_id_notif = entregable.id
    else:
        reunion = nota.reunion if nota.reunion_id is not None else nota.minuta.reunion
        destinatarios = {reunion.organizador_id} | {p.usuario_id for p in reunion.participantes}
        mensaje = f'{usuario.nombre} agregó una nota en la reunión "{reunion.titulo}".'
        entregable_id_notif = None

    destinatarios.discard(usuario.id)
    for destinatario_id in destinatarios:
        db.add(
            Notificacion(
                usuario_id=destinatario_id,
                entregable_id=entregable_id_notif,
                tipo=TipoNotificacion.otro,
                mensaje=mensaje,
            )
        )


def crear_nota(db: Session, usuario: Usuario, datos: NotaCrear) -> Nota:
    if not _puede_ver_padre(db, usuario, datos.entregable_id, datos.reunion_id, datos.minuta_id):
        raise HTTPException(status_code=403, detail="No tienes acceso a este contenido")

    nota = Nota(
        entregable_id=datos.entregable_id,
        reunion_id=datos.reunion_id,
        minuta_id=datos.minuta_id,
        contenido=datos.contenido,
        autor_id=usuario.id,
    )
    db.add(nota)
    db.flush()  # asigna nota.id y deja disponibles las relaciones (entregable/reunion/minuta)
    _notificar_nota_nueva(db, usuario, nota)
    return nota


def eliminar_nota(db: Session, usuario: Usuario, nota_id: int) -> None:
    nota = db.query(Nota).filter(Nota.id == nota_id).first()
    if not nota:
        raise HTTPException(status_code=404, detail="Nota no encontrada")
    es_autor = nota.autor_id == usuario.id
    if not es_autor and not _puede_editar_padre(db, usuario, nota):
        raise HTTPException(status_code=403, detail="No tienes permiso para eliminar esta nota")
    db.delete(nota)

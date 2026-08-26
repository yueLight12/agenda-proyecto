"""
Servicio de notas: crear, listar y eliminar notas sobre un entregable, una
reunión, una minuta, o un proyecto/tema.

Regla de visibilidad (igual que Minuta/AcuerdoMinuta con Reunion, ver
app/services/minutas.py): la nota NUNCA calcula su propio permiso. Se
resuelve el padre (entregable, reunión, la reunión de la minuta, o el
proyecto/tema) y se delega en las funciones ya existentes de
app.core.permissions. Crear una nota requiere poder VER el padre;
editar/borrar requiere ser el autor o poder EDITAR el padre (N1/N2 del
proyecto, o super admin — ya cubierto dentro de
puede_editar_entregable/puede_editar_reunion; para proyecto_id se usa
obtener_rol_en_proyecto, mismo criterio que puede_editar_serie en
app/services/series_reunion.py).

Al crear una nota se notifica (in-app, reutilizando Notificacion/
TipoNotificacion.otro — sin tipo ni columna nueva) a quien correspondería
enterarse: el responsable del entregable, el organizador + invitados de la
reunión/minuta, o quien tenga rol N1/N2 local en el tema (para proyecto_id),
excluyendo siempre al propio autor.
"""
from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.permissions import (
    obtener_rol_en_proyecto,
    puede_editar_entregable,
    puede_editar_reunion,
    puede_ver_entregable,
    puede_ver_reunion,
    requerir_participacion_en_proyecto,
)
from app.models.minuta import Minuta
from app.models.nota import Nota
from app.models.notificacion import TipoNotificacion
from app.models.pendiente import Pendiente
from app.models.usuario import RolEnum, Usuario
from app.models.usuario_proyecto_rol import UsuarioProyectoRol
from app.schemas.nota import NotaCrear, NotaOut
from app.services.almacenamiento import eliminar_imagen, guardar_imagen
from app.services.entregables import obtener_entregable_o_404
from app.services.notificaciones import crear_notificacion
from app.services.proyectos import obtener_proyecto_o_404
from app.services.reuniones import obtener_reunion_o_404


def nota_a_out(nota: Nota) -> NotaOut:
    return NotaOut(
        id=nota.id,
        entregable_id=nota.entregable_id,
        reunion_id=nota.reunion_id,
        minuta_id=nota.minuta_id,
        proyecto_id=nota.proyecto_id,
        nota_padre_id=nota.nota_padre_id,
        pendiente_padre_id=nota.pendiente_padre_id,
        contenido=nota.contenido,
        autor_id=nota.autor_id,
        autor_nombre=nota.autor.nombre,
        fecha_creacion=nota.fecha_creacion,
        tiene_imagen=nota.imagen_path is not None,
    )


def _obtener_nota_padre_o_404(db: Session, nota_padre_id: int) -> Nota:
    nota = db.query(Nota).filter(Nota.id == nota_padre_id).first()
    if not nota:
        raise HTTPException(status_code=404, detail="Aviso no encontrado")
    return nota


def _obtener_pendiente_padre_o_404(db: Session, pendiente_padre_id: int) -> Pendiente:
    pendiente = db.query(Pendiente).filter(Pendiente.id == pendiente_padre_id).first()
    if not pendiente:
        raise HTTPException(status_code=404, detail="Pendiente no encontrado")
    return pendiente


def _obtener_minuta_o_404(db: Session, minuta_id: int) -> Minuta:
    minuta = db.query(Minuta).filter(Minuta.id == minuta_id).first()
    if not minuta:
        raise HTTPException(status_code=404, detail="Minuta no encontrada")
    return minuta


def _resolver_raiz(
    db: Session,
    entregable_id: int | None,
    reunion_id: int | None,
    minuta_id: int | None,
    proyecto_id: int | None,
    nota_padre_id: int | None,
    pendiente_padre_id: int | None,
) -> tuple[int | None, int | None, int | None, int | None]:
    """Sube la cadena de comentarios anidados SIN LÍMITE de profundidad
    (2026-08-18, a petición de Yue: "David comenta, Bernardo responde a
    ese comentario con una imagen" -- un comentario puede colgar de otro
    comentario, no solo del Aviso/Pendiente raíz) hasta encontrar el padre
    real -- un entregable, una reunión, una minuta, un proyecto/tema, o (si
    la raíz es un comentario sobre un Pendiente) el proyecto de ese
    Pendiente. Regresa (entregable_id, reunion_id, minuta_id, proyecto_id)
    listos para _puede_ver_padre/_puede_editar_padre en ese nivel real."""
    while nota_padre_id is not None:
        padre = _obtener_nota_padre_o_404(db, nota_padre_id)
        entregable_id = padre.entregable_id
        reunion_id = padre.reunion_id
        minuta_id = padre.minuta_id
        proyecto_id = padre.proyecto_id
        nota_padre_id = padre.nota_padre_id
        pendiente_padre_id = padre.pendiente_padre_id
    if pendiente_padre_id is not None:
        proyecto_id = _obtener_pendiente_padre_o_404(db, pendiente_padre_id).proyecto_id
    return entregable_id, reunion_id, minuta_id, proyecto_id


def _puede_ver_padre(
    db: Session,
    usuario: Usuario,
    entregable_id: int | None,
    reunion_id: int | None,
    minuta_id: int | None,
    proyecto_id: int | None = None,
    nota_padre_id: int | None = None,
    pendiente_padre_id: int | None = None,
) -> bool:
    entregable_id, reunion_id, minuta_id, proyecto_id = _resolver_raiz(
        db, entregable_id, reunion_id, minuta_id, proyecto_id, nota_padre_id, pendiente_padre_id
    )
    if entregable_id is not None:
        entregable = obtener_entregable_o_404(db, entregable_id)
        return puede_ver_entregable(db, usuario, entregable)
    if reunion_id is not None:
        reunion = obtener_reunion_o_404(db, reunion_id)
        return puede_ver_reunion(db, usuario, reunion)
    if minuta_id is not None:
        minuta = _obtener_minuta_o_404(db, minuta_id)
        return puede_ver_reunion(db, usuario, minuta.reunion)
    obtener_proyecto_o_404(db, proyecto_id)
    try:
        requerir_participacion_en_proyecto(db, usuario, proyecto_id)
        return True
    except HTTPException:
        return False


def _puede_editar_padre(db: Session, usuario: Usuario, nota: Nota) -> bool:
    entregable_id, reunion_id, minuta_id, proyecto_id = _resolver_raiz(
        db, nota.entregable_id, nota.reunion_id, nota.minuta_id, nota.proyecto_id,
        nota.nota_padre_id, nota.pendiente_padre_id,
    )
    if entregable_id is not None:
        return puede_editar_entregable(db, usuario, obtener_entregable_o_404(db, entregable_id))
    if reunion_id is not None:
        return puede_editar_reunion(db, usuario, obtener_reunion_o_404(db, reunion_id))
    if minuta_id is not None:
        return puede_editar_reunion(db, usuario, _obtener_minuta_o_404(db, minuta_id).reunion)
    if usuario.es_super_admin:
        return True
    fila = obtener_rol_en_proyecto(db, usuario.id, proyecto_id)
    return fila is not None and fila.rol in (RolEnum.N1, RolEnum.N2)


def listar_notas(
    db: Session,
    usuario: Usuario,
    entregable_id: int | None,
    reunion_id: int | None,
    minuta_id: int | None,
    proyecto_id: int | None = None,
    nota_padre_id: int | None = None,
    pendiente_padre_id: int | None = None,
) -> list[Nota]:
    padres = [entregable_id, reunion_id, minuta_id, proyecto_id, nota_padre_id, pendiente_padre_id]
    if sum(1 for p in padres if p is not None) != 1:
        raise HTTPException(
            status_code=400,
            detail="Debes indicar exactamente uno de: entregable_id, reunion_id, "
            "minuta_id, proyecto_id, nota_padre_id o pendiente_padre_id",
        )

    if not _puede_ver_padre(
        db, usuario, entregable_id, reunion_id, minuta_id, proyecto_id,
        nota_padre_id, pendiente_padre_id,
    ):
        raise HTTPException(status_code=403, detail="No tienes acceso a este contenido")

    query = db.query(Nota)
    if entregable_id is not None:
        query = query.filter(Nota.entregable_id == entregable_id)
    elif reunion_id is not None:
        query = query.filter(Nota.reunion_id == reunion_id)
    elif minuta_id is not None:
        query = query.filter(Nota.minuta_id == minuta_id)
    elif nota_padre_id is not None:
        query = query.filter(Nota.nota_padre_id == nota_padre_id)
    elif pendiente_padre_id is not None:
        query = query.filter(Nota.pendiente_padre_id == pendiente_padre_id)
    else:
        query = query.filter(Nota.proyecto_id == proyecto_id)
    return query.order_by(Nota.fecha_creacion.asc()).all()


def _notificar_nota_nueva(db: Session, usuario: Usuario, nota: Nota) -> None:
    es_comentario = nota.nota_padre_id is not None or nota.pendiente_padre_id is not None
    entregable_id, reunion_id, minuta_id, proyecto_id = _resolver_raiz(
        db, nota.entregable_id, nota.reunion_id, nota.minuta_id, nota.proyecto_id,
        nota.nota_padre_id, nota.pendiente_padre_id,
    )
    verbo = "dejó un comentario" if es_comentario else "agregó una nota"

    if entregable_id is not None:
        entregable = obtener_entregable_o_404(db, entregable_id)
        destinatarios = {entregable.responsable_id, entregable.creado_por}
        mensaje = f'{usuario.nombre} {verbo} en el entregable "{entregable.nombre}".'
        entregable_id_notif = entregable.id
    elif proyecto_id is not None:
        destinatarios = {
            r.usuario_id
            for r in db.query(UsuarioProyectoRol)
            .filter(
                UsuarioProyectoRol.proyecto_id == proyecto_id,
                UsuarioProyectoRol.rol.in_([RolEnum.N1, RolEnum.N2]),
            )
            .all()
        }
        proyecto_nombre = obtener_proyecto_o_404(db, proyecto_id).nombre
        mensaje = f'{usuario.nombre} {verbo} en el tema "{proyecto_nombre}".'
        entregable_id_notif = None
    else:
        reunion = obtener_reunion_o_404(db, reunion_id) if reunion_id is not None else _obtener_minuta_o_404(db, minuta_id).reunion
        destinatarios = {reunion.organizador_id} | {p.usuario_id for p in reunion.participantes}
        mensaje = f'{usuario.nombre} {verbo} en la reunión "{reunion.titulo}".'
        entregable_id_notif = None

    destinatarios.discard(usuario.id)
    for destinatario_id in destinatarios:
        crear_notificacion(
            db,
            destinatario_id,
            TipoNotificacion.otro,
            mensaje,
            entregable_id=entregable_id_notif,
        )


def crear_nota(db: Session, usuario: Usuario, datos: NotaCrear) -> Nota:
    if not _puede_ver_padre(
        db, usuario, datos.entregable_id, datos.reunion_id, datos.minuta_id, datos.proyecto_id,
        datos.nota_padre_id, datos.pendiente_padre_id,
    ):
        raise HTTPException(status_code=403, detail="No tienes acceso a este contenido")

    nota = Nota(
        entregable_id=datos.entregable_id,
        reunion_id=datos.reunion_id,
        minuta_id=datos.minuta_id,
        proyecto_id=datos.proyecto_id,
        nota_padre_id=datos.nota_padre_id,
        pendiente_padre_id=datos.pendiente_padre_id,
        contenido=datos.contenido,
        autor_id=usuario.id,
    )
    db.add(nota)
    db.flush()  # asigna nota.id y deja disponibles las relaciones (entregable/reunion/minuta/proyecto)
    _notificar_nota_nueva(db, usuario, nota)
    return nota


def eliminar_nota(db: Session, usuario: Usuario, nota_id: int) -> None:
    nota = db.query(Nota).filter(Nota.id == nota_id).first()
    if not nota:
        raise HTTPException(status_code=404, detail="Nota no encontrada")
    es_autor = nota.autor_id == usuario.id
    if not es_autor and not _puede_editar_padre(db, usuario, nota):
        raise HTTPException(status_code=403, detail="No tienes permiso para eliminar esta nota")
    eliminar_imagen(nota.imagen_path)
    db.delete(nota)


def obtener_nota_visible_o_404(db: Session, usuario: Usuario, nota_id: int) -> Nota:
    """Trae una nota puntual validando el mismo criterio de visibilidad que
    listar_notas -- usado para adjuntar/leer su imagen (ver
    app/routers/notas.py)."""
    nota = db.query(Nota).filter(Nota.id == nota_id).first()
    if not nota:
        raise HTTPException(status_code=404, detail="Nota no encontrada")
    if not _puede_ver_padre(
        db, usuario, nota.entregable_id, nota.reunion_id, nota.minuta_id, nota.proyecto_id,
        nota.nota_padre_id, nota.pendiente_padre_id,
    ):
        raise HTTPException(status_code=403, detail="No tienes acceso a esta nota")
    return nota


async def agregar_imagen_a_nota(
    db: Session, usuario: Usuario, nota_id: int, archivo: UploadFile
) -> Nota:
    """Adjunta (o reemplaza) la captura de pantalla de una nota ya
    existente -- mismo criterio de permiso que borrarla: el autor, o quien
    pueda editar el padre."""
    nota = db.query(Nota).filter(Nota.id == nota_id).first()
    if not nota:
        raise HTTPException(status_code=404, detail="Nota no encontrada")
    es_autor = nota.autor_id == usuario.id
    if not es_autor and not _puede_editar_padre(db, usuario, nota):
        raise HTTPException(status_code=403, detail="No tienes permiso para editar esta nota")

    if nota.imagen_path:
        eliminar_imagen(nota.imagen_path)
    nota.imagen_path = await guardar_imagen(archivo, subcarpeta="notas")
    return nota

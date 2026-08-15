"""
Servicio de minutas y acuerdos: crear/actualizar minuta, agregar acuerdo,
convertir un acuerdo en Entregable real. Usado por el router REST
(app/routers/minutas.py) y por el asistente de voz (app/services/asistente/).

La visibilidad de una minuta es la misma que la de su reunión (reutiliza
puede_ver_reunion de app.core.permissions). Editar el CONTENIDO de la
minuta (notas y acuerdos) usa puede_editar_minuta — más permisiva que
puede_editar_reunion: cualquier invitado puede aportar a la minuta, no solo
N1/N2/organizador (la reunión en sí — título/fecha/participantes — sigue
protegida por puede_editar_reunion sin cambios, ver ModalReunion/reuniones.py).
Convertir un acuerdo en entregable reutiliza
app.services.entregables.crear_entregable, la misma lógica y notificaciones
que usa la creación normal de entregables.
"""
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.permissions import (
    puede_editar_minuta,
    puede_ver_reunion,
    requerir_participacion_en_proyecto,
)
from app.models.minuta import AcuerdoMinuta, Minuta
from app.schemas.minuta import AcuerdoOut, MinutaOut
from app.services.entregables import crear_entregable
from app.services.reuniones import obtener_reunion_o_404
from app.models.usuario import Usuario


def acuerdo_a_out(acuerdo: AcuerdoMinuta) -> AcuerdoOut:
    return AcuerdoOut(
        id=acuerdo.id,
        descripcion=acuerdo.descripcion,
        responsable_id=acuerdo.responsable_id,
        responsable_nombre=acuerdo.responsable.nombre if acuerdo.responsable else None,
        entregable_id=acuerdo.entregable_id,
        convertido=acuerdo.convertido,
    )


def minuta_a_out(minuta: Minuta) -> MinutaOut:
    return MinutaOut(
        id=minuta.id,
        reunion_id=minuta.reunion_id,
        contenido=minuta.contenido,
        creado_por=minuta.creado_por,
        fecha_actualizacion=minuta.fecha_actualizacion,
        acuerdos=[acuerdo_a_out(a) for a in minuta.acuerdos],
    )


def obtener_minuta_o_404(db: Session, minuta_id: int) -> Minuta:
    minuta = db.query(Minuta).filter(Minuta.id == minuta_id).first()
    if not minuta:
        raise HTTPException(status_code=404, detail="Minuta no encontrada")
    return minuta


def crear_o_actualizar_minuta(
    db: Session, usuario: Usuario, reunion_id: int, contenido: str | None
) -> Minuta:
    """Crea la minuta de la reunión, o actualiza su contenido si ya existía."""
    reunion = obtener_reunion_o_404(db, reunion_id)
    if not puede_editar_minuta(db, usuario, reunion):
        raise HTTPException(status_code=403, detail="No tienes permiso para editar esta minuta")

    minuta = db.query(Minuta).filter(Minuta.reunion_id == reunion_id).first()
    if minuta:
        minuta.contenido = contenido
    else:
        minuta = Minuta(reunion_id=reunion_id, contenido=contenido, creado_por=usuario.id)
        db.add(minuta)

    return minuta


def agregar_acuerdo(
    db: Session, usuario: Usuario, minuta_id: int, descripcion: str, responsable_id: int | None
) -> AcuerdoMinuta:
    minuta = obtener_minuta_o_404(db, minuta_id)
    if not puede_editar_minuta(db, usuario, minuta.reunion):
        raise HTTPException(status_code=403, detail="No tienes permiso para editar esta minuta")

    acuerdo = AcuerdoMinuta(
        minuta_id=minuta_id,
        descripcion=descripcion,
        responsable_id=responsable_id,
    )
    db.add(acuerdo)
    return acuerdo


def eliminar_acuerdo(db: Session, usuario: Usuario, acuerdo_id: int) -> None:
    acuerdo = db.query(AcuerdoMinuta).filter(AcuerdoMinuta.id == acuerdo_id).first()
    if not acuerdo:
        raise HTTPException(status_code=404, detail="Acuerdo no encontrado")
    if not puede_editar_minuta(db, usuario, acuerdo.minuta.reunion):
        raise HTTPException(status_code=403, detail="No tienes permiso para editar esta minuta")
    db.delete(acuerdo)


def convertir_acuerdo_a_entregable(
    db: Session, usuario: Usuario, acuerdo_id: int, fecha_entrega, sensible: bool
) -> AcuerdoMinuta:
    """
    Crea un Entregable a partir de este acuerdo (mismo responsable y
    descripción) y lo enlaza. Reutiliza la misma regla que crear un
    entregable normal: N1/N2 pueden asignarlo a quien sea de su equipo,
    N3/N4 solo pueden convertir acuerdos donde ellos son el responsable.
    """
    acuerdo = db.query(AcuerdoMinuta).filter(AcuerdoMinuta.id == acuerdo_id).first()
    if not acuerdo:
        raise HTTPException(status_code=404, detail="Acuerdo no encontrado")
    if acuerdo.convertido:
        raise HTTPException(status_code=400, detail="Este acuerdo ya fue convertido en entregable")
    if not acuerdo.responsable_id:
        raise HTTPException(
            status_code=400, detail="El acuerdo necesita un responsable antes de convertirlo"
        )

    reunion = acuerdo.minuta.reunion
    if not puede_ver_reunion(db, usuario, reunion):
        raise HTTPException(status_code=403, detail="No tienes acceso a esta reunión")

    rol = requerir_participacion_en_proyecto(db, usuario, reunion.proyecto_id)

    nuevo = crear_entregable(
        db,
        reunion.proyecto_id,
        usuario,
        rol,
        nombre=acuerdo.descripcion[:200],
        descripcion=f'Acuerdo de la minuta de "{reunion.titulo}".',
        responsable_id=acuerdo.responsable_id,
        fecha_entrega=fecha_entrega,
        sensible=sensible,
    )
    db.flush()

    acuerdo.entregable_id = nuevo.id
    acuerdo.convertido = True
    return acuerdo

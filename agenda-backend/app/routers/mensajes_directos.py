"""
Router de mensajes directos persona-a-persona. Toda la lógica de permisos
vive en app.services.mensajes_directos — este router solo valida el
schema de entrada y arma la respuesta.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import obtener_usuario_actual
from app.models.usuario import Usuario
from app.schemas.mensaje_directo import ConversacionResumenOut, MensajeDirectoCrear, MensajeDirectoOut
from app.schemas.proyecto import MiembroEquipoOut
from app.services.mensajes_directos import (
    enviar_mensaje as enviar_mensaje_servicio,
    listar_contactos as listar_contactos_servicio,
    listar_conversacion as listar_conversacion_servicio,
    listar_resumen_conversaciones as listar_resumen_conversaciones_servicio,
    marcar_conversacion_leida as marcar_conversacion_leida_servicio,
)

router = APIRouter(prefix="/mensajes-directos", tags=["Mensajes directos"])


def _mensaje_a_out(m) -> MensajeDirectoOut:
    return MensajeDirectoOut(
        id=m.id,
        autor_id=m.autor_id,
        autor_nombre=m.autor.nombre,
        destinatario_id=m.destinatario_id,
        destinatario_nombre=m.destinatario.nombre,
        contenido=m.contenido,
        fecha_creacion=m.fecha_creacion,
        fecha_leido=m.fecha_leido,
    )


@router.get("/contactos", response_model=list[MiembroEquipoOut])
def listar_contactos(
    db: Session = Depends(get_db), usuario: Usuario = Depends(obtener_usuario_actual)
):
    """A quién le puedes escribir -- mismo criterio que a quién puedes
    invitar a una reunión general."""
    return listar_contactos_servicio(db, usuario)


@router.get("/resumen", response_model=list[ConversacionResumenOut])
def listar_resumen(
    db: Session = Depends(get_db), usuario: Usuario = Depends(obtener_usuario_actual)
):
    return listar_resumen_conversaciones_servicio(db, usuario)


@router.get("/con/{otro_id}", response_model=list[MensajeDirectoOut])
def listar_conversacion(
    otro_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    mensajes = listar_conversacion_servicio(db, usuario, otro_id)
    return [_mensaje_a_out(m) for m in mensajes]


@router.post("/con/{otro_id}", response_model=MensajeDirectoOut, status_code=201)
def enviar_mensaje(
    otro_id: int,
    datos: MensajeDirectoCrear,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    mensaje = enviar_mensaje_servicio(db, usuario, otro_id, datos.contenido)
    db.commit()
    db.refresh(mensaje)
    return _mensaje_a_out(mensaje)


@router.patch("/con/{otro_id}/leido", status_code=204)
def marcar_leido(
    otro_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    marcar_conversacion_leida_servicio(db, usuario, otro_id)
    db.commit()

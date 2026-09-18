"""
Servicio de mensajes directos persona-a-persona (2026-09-19, a petición de
Yue -- ver app/models/mensaje_directo.py para el porqué).

Quién le puede escribir a quién: EXACTAMENTE la misma audiencia que ya
existe para invitarse a una reunión general (listar_invitables_reunion con
proyecto_id=None) -- se reutiliza tal cual, sin duplicar la regla. Ver un
hilo ya existente no repite esa validación (basta con que el usuario sea
autor o destinatario de esos mensajes, algo que la propia consulta ya
garantiza por construcción) -- así no se pierde acceso a una conversación
pasada si la relación entre las personas cambia después.
"""
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.mensaje_directo import MensajeDirecto
from app.models.notificacion import TipoNotificacion
from app.models.usuario import Usuario
from app.schemas.mensaje_directo import ConversacionResumenOut
from app.services.notificaciones import crear_notificacion
from app.services.reuniones import listar_invitables_reunion
from app.services.usuarios import obtener_usuario_o_404


def listar_contactos(db: Session, usuario: Usuario):
    return listar_invitables_reunion(db, usuario, None)


def _puede_enviar_a(db: Session, usuario: Usuario, destinatario_id: int) -> bool:
    if destinatario_id == usuario.id:
        return False
    return any(m.usuario_id == destinatario_id for m in listar_contactos(db, usuario))


def enviar_mensaje(
    db: Session, usuario: Usuario, destinatario_id: int, contenido: str
) -> MensajeDirecto:
    destinatario = obtener_usuario_o_404(db, destinatario_id)
    if not _puede_enviar_a(db, usuario, destinatario_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No puedes enviarle un mensaje directo a esta persona.",
        )
    mensaje = MensajeDirecto(
        autor_id=usuario.id, destinatario_id=destinatario.id, contenido=contenido
    )
    db.add(mensaje)
    db.flush()
    crear_notificacion(
        db,
        destinatario.id,
        TipoNotificacion.mensaje_directo,
        f'{usuario.nombre} te mandó un mensaje: "{contenido[:80]}"',
        titulo_push=f"Mensaje de {usuario.nombre}",
    )
    return mensaje


def listar_conversacion(db: Session, usuario: Usuario, otro_id: int) -> list[MensajeDirecto]:
    obtener_usuario_o_404(db, otro_id)
    return (
        db.query(MensajeDirecto)
        .filter(
            or_(
                (MensajeDirecto.autor_id == usuario.id) & (MensajeDirecto.destinatario_id == otro_id),
                (MensajeDirecto.autor_id == otro_id) & (MensajeDirecto.destinatario_id == usuario.id),
            )
        )
        .order_by(MensajeDirecto.fecha_creacion.asc())
        .all()
    )


def marcar_conversacion_leida(db: Session, usuario: Usuario, otro_id: int) -> None:
    (
        db.query(MensajeDirecto)
        .filter(
            MensajeDirecto.destinatario_id == usuario.id,
            MensajeDirecto.autor_id == otro_id,
            MensajeDirecto.fecha_leido.is_(None),
        )
        .update({"fecha_leido": datetime.utcnow()})
    )


def listar_resumen_conversaciones(db: Session, usuario: Usuario) -> list[ConversacionResumenOut]:
    """"Inbox": una fila por cada persona con la que ya hay al menos un
    mensaje (en cualquier dirección), con el último mensaje y cuántos de
    ELLA sigues sin leer. En memoria (no una consulta agregada) a
    propósito -- volumen bajo, mucho más simple de leer que el SQL
    equivalente."""
    mensajes = (
        db.query(MensajeDirecto)
        .filter(
            or_(MensajeDirecto.autor_id == usuario.id, MensajeDirecto.destinatario_id == usuario.id)
        )
        .order_by(MensajeDirecto.fecha_creacion.asc())
        .all()
    )
    por_contraparte: dict[int, dict] = {}
    for m in mensajes:
        contraparte = m.destinatario if m.autor_id == usuario.id else m.autor
        entrada = por_contraparte.setdefault(
            contraparte.id,
            {"usuario": contraparte, "ultimo": None, "no_leidos": 0},
        )
        entrada["ultimo"] = m
        if m.destinatario_id == usuario.id and m.fecha_leido is None:
            entrada["no_leidos"] += 1

    resultado = [
        ConversacionResumenOut(
            usuario_id=e["usuario"].id,
            nombre=e["usuario"].nombre,
            puesto=e["usuario"].puesto,
            ultimo_mensaje=e["ultimo"].contenido,
            fecha_ultimo_mensaje=e["ultimo"].fecha_creacion,
            no_leidos=e["no_leidos"],
        )
        for e in por_contraparte.values()
    ]
    resultado.sort(key=lambda c: c.fecha_ultimo_mensaje, reverse=True)
    return resultado

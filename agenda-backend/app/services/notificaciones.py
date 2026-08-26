"""
Punto único de creación de notificaciones in-app.

SIEMPRE dispara también el push del navegador (2026-08-26, a petición de
Yue: hasta ahora el push solo estaba conectado a la asignación de una tarea
urgente -- todo lo demás, avance actualizado/tarea completada/recordatorios
de reunión/etc., solo aparecía dentro de la app y nunca llegaba con el
celular bloqueado o la app cerrada. Bug real: Juan marcó una tarea como
completada y a Bernardo, quien la creó, no le llegó nada fuera de la app).

Los servicios ya NO deben instanciar `Notificacion(...)` + `db.add()`
directo -- deben llamar `crear_notificacion` para que ningún tipo de aviso
nuevo se quede sin push por accidente (el olvido es justo lo que causó el
bug de arriba).
"""
from sqlalchemy.orm import Session

from app.models.notificacion import Notificacion, TipoNotificacion
from app.services.push import enviar_push

TITULO_PUSH_DEFECTO = "Agenda Inteligente"


def crear_notificacion(
    db: Session,
    usuario_id: int,
    tipo: TipoNotificacion,
    mensaje: str,
    entregable_id: int | None = None,
    reunion_id: int | None = None,
    evento_empresa_id: int | None = None,
    urgente: bool = False,
    push: bool = True,
    titulo_push: str = TITULO_PUSH_DEFECTO,
) -> Notificacion:
    """Crea la notificación in-app (queda en `db.add`, el caller sigue
    siendo responsable de `db.commit()`/`db.flush()`) y, salvo que el
    caller ya vaya a mandar su propio push más específico (`push=False`,
    ver el caso de "tarea urgente asignada" en entregables.py, que usa un
    título y cuerpo con más contexto), dispara un push genérico con el
    mismo mensaje. `enviar_push` nunca lanza excepción ni bloquea si el
    usuario no tiene suscripciones activas -- ver app/services/push.py."""
    notificacion = Notificacion(
        usuario_id=usuario_id,
        entregable_id=entregable_id,
        reunion_id=reunion_id,
        evento_empresa_id=evento_empresa_id,
        tipo=tipo,
        mensaje=mensaje,
        urgente=urgente,
    )
    db.add(notificacion)
    if push:
        enviar_push(db, usuario_id, titulo_push, mensaje)
    return notificacion

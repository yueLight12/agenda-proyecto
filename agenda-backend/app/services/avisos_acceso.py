"""
Aviso de "nunca has entrado al sistema" (2026-08-21, a petición de Yue,
ejemplo real: "Bernardo asigna algo a Beatriz, pero Beatriz nunca ha
entrado -- el sistema le manda un correo avisándole"). Se llama desde
crear_entregable/reasignar_entregable (app/services/entregables.py) justo
después de determinar quién es el nuevo responsable.

Se manda UNA sola vez por persona (a petición explícita de Yue, para no
saturar de correos a alguien que ya vio el primer aviso pero sigue sin
entrar) -- el flag Usuario.aviso_acceso_enviado es lo que lo garantiza,
independiente de Usuario.ultimo_login (que solo cambia cuando la persona
SÍ inicia sesión, pudiendo pasar mucho tiempo/varias asignaciones antes).
"""
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.usuario import Usuario
from app.services.email_cliente import enviar_correo


def avisar_si_nunca_ha_entrado(
    db: Session, responsable: Usuario, asignado_por: Usuario, nombre_entregable: str
) -> None:
    """
    Si `responsable` nunca ha iniciado sesión y todavía no se le mandó
    este aviso, le manda un correo real invitándolo a entrar al sistema.
    No hace nada (silenciosamente) si ya entró alguna vez o si ya se le
    avisó antes -- no lanza excepciones: un fallo de correo no debe
    romper la creación/reasignación del entregable que lo disparó.
    """
    if responsable.ultimo_login is not None:
        return
    if responsable.aviso_acceso_enviado:
        return

    enlace = (
        f" Para verla, entra a {settings.url_app}"
        if settings.url_app
        else " Para verla, entra a la app en tu celular o desde tu computadora."
    )
    cuerpo = (
        f"Hola {responsable.nombre},\n\n"
        f"{asignado_por.nombre} te asignó \"{nombre_entregable}\" en Agenda Inteligente.\n\n"
        f"Todavía no has entrado al sistema.{enlace}\n\n"
        "Este es un aviso único -- no lo volverás a recibir una vez que inicies sesión."
    )

    if enviar_correo(
        responsable.email,
        "Te asignaron una tarea en Agenda Inteligente",
        cuerpo,
    ):
        responsable.aviso_acceso_enviado = True

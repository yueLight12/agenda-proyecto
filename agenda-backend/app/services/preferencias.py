"""
Servicio de preferencias de apariencia por usuario -- ver
app/models/preferencia_usuario.py. Cada usuario solo lee/edita las suyas
(no hay noción de "ver las preferencias de otro"), así que no hay chequeo
de permisos más allá de estar autenticado.
"""
from sqlalchemy.orm import Session

from app.models.preferencia_usuario import PreferenciaUsuario
from app.models.usuario import Usuario
from app.schemas.preferencia_usuario import PreferenciaUsuarioActualizar


def obtener_o_crear_preferencias(db: Session, usuario: Usuario) -> PreferenciaUsuario:
    preferencias = (
        db.query(PreferenciaUsuario)
        .filter(PreferenciaUsuario.usuario_id == usuario.id)
        .first()
    )
    if preferencias is None:
        preferencias = PreferenciaUsuario(usuario_id=usuario.id)
        db.add(preferencias)
        db.commit()
        db.refresh(preferencias)
    return preferencias


def actualizar_preferencias(
    db: Session, usuario: Usuario, datos: PreferenciaUsuarioActualizar
) -> PreferenciaUsuario:
    preferencias = obtener_o_crear_preferencias(db, usuario)
    if datos.shape is not None:
        preferencias.shape = datos.shape
    if datos.theme is not None:
        preferencias.theme = datos.theme
    if datos.card_order is not None:
        preferencias.card_order = datos.card_order
    if datos.tarjetas_ocultas is not None:
        preferencias.tarjetas_ocultas = datos.tarjetas_ocultas
    if datos.tour_completado is not None:
        preferencias.tour_completado = datos.tour_completado
    db.commit()
    db.refresh(preferencias)
    return preferencias

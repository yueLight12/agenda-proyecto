"""
Servicio de pendientes personales: checklist 100% privado de cada usuario
(ver app/models/pendiente_personal.py). El único criterio de acceso es ser
el dueño (`usuario_id == usuario.id`) -- no hay rol N1-N4 ni proyecto de
por medio, así que este módulo NO importa nada de app/core/permissions.py
a propósito.
"""
import calendar
from datetime import date

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.pendiente_personal import PendientePersonal
from app.models.usuario import Usuario
from app.schemas.pendiente_personal import PendientePersonalActualizar, PendientePersonalCrear


def _siguiente_fecha(fecha_actual: date, recurrencia: str) -> date:
    """Avanza `fecha_actual` según la recurrencia, tomando el día/mes de la
    propia fecha (no hay campo aparte de "día del mes"). Para "mensual"/
    "anual", si el mes destino es más corto (ej. día 31 en un mes de 30
    días, o 29 de febrero en año no bisiesto), se recorta al último día
    de ese mes en vez de reventar."""
    if recurrencia == "semanal":
        from datetime import timedelta

        return fecha_actual + timedelta(days=7)
    if recurrencia == "mensual":
        mes = fecha_actual.month + 1
        anio = fecha_actual.year + (1 if mes > 12 else 0)
        mes = 1 if mes > 12 else mes
        ultimo_dia = calendar.monthrange(anio, mes)[1]
        return date(anio, mes, min(fecha_actual.day, ultimo_dia))
    if recurrencia == "anual":
        anio = fecha_actual.year + 1
        ultimo_dia = calendar.monthrange(anio, fecha_actual.month)[1]
        return date(anio, fecha_actual.month, min(fecha_actual.day, ultimo_dia))
    raise ValueError(f"Recurrencia desconocida: {recurrencia}")


def _obtener_propio_o_404(db: Session, usuario: Usuario, pendiente_id: int) -> PendientePersonal:
    pendiente = (
        db.query(PendientePersonal)
        .filter(PendientePersonal.id == pendiente_id, PendientePersonal.usuario_id == usuario.id)
        .first()
    )
    if pendiente is None:
        # 404, no 403 -- no se revela si existe una fila con ese id que sea
        # de alguien más, mismo criterio de discreción que el resto del
        # sistema con lo que no le toca ver a quien pregunta.
        raise HTTPException(status_code=404, detail="Pendiente personal no encontrado")
    return pendiente


def listar_pendientes_personales(db: Session, usuario: Usuario) -> list[PendientePersonal]:
    return (
        db.query(PendientePersonal)
        .filter(PendientePersonal.usuario_id == usuario.id)
        .order_by(PendientePersonal.hecho.asc(), PendientePersonal.fecha_creacion.desc())
        .all()
    )


def crear_pendiente_personal(
    db: Session, usuario: Usuario, datos: PendientePersonalCrear
) -> PendientePersonal:
    pendiente = PendientePersonal(
        usuario_id=usuario.id,
        contenido=datos.contenido,
        fecha_limite=datos.fecha_limite,
        hora_limite=datos.hora_limite,
        recurrencia=datos.recurrencia,
    )
    db.add(pendiente)
    db.flush()
    return pendiente


def actualizar_pendiente_personal(
    db: Session, usuario: Usuario, pendiente_id: int, datos: PendientePersonalActualizar
) -> PendientePersonal:
    pendiente = _obtener_propio_o_404(db, usuario, pendiente_id)
    if datos.contenido is not None:
        pendiente.contenido = datos.contenido
    if datos.fecha_limite is not None:
        pendiente.fecha_limite = datos.fecha_limite
    if datos.hora_limite is not None:
        pendiente.hora_limite = datos.hora_limite
    if datos.recurrencia is not None:
        pendiente.recurrencia = datos.recurrencia

    marcado_hecho_ahora = (
        datos.hecho is True and not pendiente.hecho
    )
    if datos.hecho is not None:
        pendiente.hecho = datos.hecho

    # Al completar uno recurrente, se siembra la siguiente instancia en vez
    # de perder la periodicidad -- ej. "pagar colegiatura" del día 5 de
    # cada mes reaparece ya para el mes siguiente. El registro actual se
    # queda como historial (hecho=True), no se reutiliza.
    if marcado_hecho_ahora and pendiente.recurrencia != "ninguna" and pendiente.fecha_limite:
        siguiente = PendientePersonal(
            usuario_id=usuario.id,
            contenido=pendiente.contenido,
            fecha_limite=_siguiente_fecha(pendiente.fecha_limite, pendiente.recurrencia),
            hora_limite=pendiente.hora_limite,
            recurrencia=pendiente.recurrencia,
        )
        db.add(siguiente)

    db.flush()
    return pendiente


def eliminar_pendiente_personal(db: Session, usuario: Usuario, pendiente_id: int) -> None:
    pendiente = _obtener_propio_o_404(db, usuario, pendiente_id)
    db.delete(pendiente)

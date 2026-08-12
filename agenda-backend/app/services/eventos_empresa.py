"""
Servicio de eventos de empresa: calcula la "próxima ocurrencia" de
cumpleaños/festivos (que se repiten cada año) a partir de la fecha
original cargada, sin necesidad de una columna separada de mes/día.
"""
from datetime import date

from sqlalchemy.orm import Session

from app.models.evento_empresa import EventoEmpresa, TipoEventoEmpresa
from app.schemas.evento_empresa import EventoEmpresaOut


def _fecha_en_anio(mes: int, dia: int, anio: int) -> date:
    """29 de febrero en un año no bisiesto se corre al 1 de marzo."""
    try:
        return date(anio, mes, dia)
    except ValueError:
        return date(anio, 3, 1)


def proxima_ocurrencia(fecha_original: date, hoy: date) -> date:
    """Pública porque también la usa app/services/recordatorios.py para el
    barrido de notificaciones de cumpleaños próximos."""
    candidata = _fecha_en_anio(fecha_original.month, fecha_original.day, hoy.year)
    if candidata < hoy:
        candidata = _fecha_en_anio(fecha_original.month, fecha_original.day, hoy.year + 1)
    return candidata


def listar_eventos_empresa(db: Session, hoy: date | None = None) -> list[EventoEmpresaOut]:
    hoy = hoy or date.today()
    eventos = db.query(EventoEmpresa).all()

    resultado = []
    for e in eventos:
        if e.tipo in (TipoEventoEmpresa.cumpleanos, TipoEventoEmpresa.festivo):
            fecha_mostrada = proxima_ocurrencia(e.fecha, hoy)
        else:
            fecha_mostrada = e.fecha
        resultado.append(
            EventoEmpresaOut(
                id=e.id,
                nombre=e.nombre,
                tipo=e.tipo,
                fecha=fecha_mostrada,
                fecha_original=e.fecha,
            )
        )

    resultado.sort(key=lambda e: e.fecha)
    return resultado

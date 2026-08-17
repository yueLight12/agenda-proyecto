"""
Materializa las ocurrencias futuras de las series de reuniones recurrentes
como Reunion reales (con serie_id puesto), con antelación -- mismo patrón
que app/services/recordatorios.py: se corre desde el scheduler de
app/main.py y también disparable a mano desde
POST /admin/generar-recordatorios, es idempotente (nunca duplica una
ocurrencia que ya existe para esa fecha).

Decisión de diseño (ver plan de Fase 2/3): las ocurrencias se materializan
con antelación, no se calculan al vuelo -- así cada una es una Reunion de
verdad, se puede mover/cancelar una sola ocurrencia sin afectar las demás,
y tiene su propia Minuta con la agenda de la serie precargada.
"""
import calendar
from datetime import date, datetime, time, timedelta

from sqlalchemy.orm import Session

from app.models.notificacion import Notificacion, TipoNotificacion
from app.models.reunion import Reunion, ReunionParticipante
from app.models.serie_reunion import SerieReunion, TipoRecurrencia


def _fecha_mes(anio: int, mes: int, dia: int) -> date:
    """Clamp de `dia` al último día real de ese mes (ej. dia_mes=31 en
    febrero cae en 28 o 29)."""
    ultimo_dia_mes = calendar.monthrange(anio, mes)[1]
    return date(anio, mes, min(dia, ultimo_dia_mes))


def _mes_siguiente(anio: int, mes: int) -> tuple[int, int]:
    return (anio + 1, 1) if mes == 12 else (anio, mes + 1)


def _proximas_fechas(serie: SerieReunion, hoy: date, horizonte_dias: int) -> list[date]:
    """Todas las fechas dentro de [hoy, hoy+horizonte_dias] que caen dentro
    de [fecha_inicio, fecha_fin], según el patrón de recurrencia de la
    serie (diaria/semanal/mensual, ver TipoRecurrencia)."""
    fin_ventana = hoy + timedelta(days=horizonte_dias)
    inicio = max(serie.fecha_inicio, hoy)
    if serie.fecha_fin is not None:
        fin_ventana = min(fin_ventana, serie.fecha_fin)
    if inicio > fin_ventana:
        return []

    fechas = []

    if serie.tipo_recurrencia == TipoRecurrencia.diaria:
        cursor = inicio
        while cursor <= fin_ventana:
            fechas.append(cursor)
            cursor += timedelta(days=1)

    elif serie.tipo_recurrencia == TipoRecurrencia.mensual:
        cursor = _fecha_mes(inicio.year, inicio.month, serie.dia_mes)
        if cursor < inicio:
            anio, mes = _mes_siguiente(inicio.year, inicio.month)
            cursor = _fecha_mes(anio, mes, serie.dia_mes)
        while cursor <= fin_ventana:
            fechas.append(cursor)
            anio, mes = _mes_siguiente(cursor.year, cursor.month)
            cursor = _fecha_mes(anio, mes, serie.dia_mes)

    else:  # semanal (default, comportamiento original)
        cursor = inicio
        # Avanza al primer día que coincide con dia_semana.
        delta = (serie.dia_semana - cursor.weekday()) % 7
        cursor = cursor + timedelta(days=delta)
        while cursor <= fin_ventana:
            fechas.append(cursor)
            cursor += timedelta(days=7)

    return fechas


def materializar_ocurrencias(db: Session, horizonte_dias: int = 14) -> int:
    """Devuelve el total de ocurrencias (Reunion) creadas."""
    hoy = date.today()
    series_activas = db.query(SerieReunion).filter(SerieReunion.activa.is_(True)).all()

    creadas = 0
    for serie in series_activas:
        fechas = _proximas_fechas(serie, hoy, horizonte_dias)
        if not fechas:
            continue

        fechas_existentes = {
            r.fecha_inicio.date()
            for r in db.query(Reunion).filter(Reunion.serie_id == serie.id).all()
        }

        for fecha in fechas:
            if fecha in fechas_existentes:
                continue

            fecha_inicio = datetime.combine(fecha, serie.hora)
            nueva = Reunion(
                proyecto_id=serie.proyecto_id,
                titulo=serie.titulo,
                fecha_inicio=fecha_inicio,
                duracion_minutos=serie.duracion_minutos,
                organizador_id=serie.organizador_id,
                serie_id=serie.id,
            )
            db.add(nueva)
            db.flush()

            for sp in serie.participantes:
                db.add(ReunionParticipante(reunion_id=nueva.id, usuario_id=sp.usuario_id))
                db.add(
                    Notificacion(
                        usuario_id=sp.usuario_id,
                        reunion_id=nueva.id,
                        tipo=TipoNotificacion.otro,
                        mensaje=f'Nueva ocurrencia de "{serie.titulo}" agendada para el '
                        f'{fecha_inicio.strftime("%d/%m/%Y a las %H:%M")}.',
                    )
                )
            creadas += 1

    db.commit()
    return creadas

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
from datetime import date, datetime, time, timedelta

from sqlalchemy.orm import Session

from app.models.notificacion import Notificacion, TipoNotificacion
from app.models.reunion import Reunion, ReunionParticipante
from app.models.serie_reunion import SerieReunion


def _proximas_fechas(serie: SerieReunion, hoy: date, horizonte_dias: int) -> list[date]:
    """Todas las fechas dentro de [hoy, hoy+horizonte_dias] que caen en el
    dia_semana de la serie y dentro de [fecha_inicio, fecha_fin]."""
    fin_ventana = hoy + timedelta(days=horizonte_dias)
    inicio = max(serie.fecha_inicio, hoy)
    if serie.fecha_fin is not None:
        fin_ventana = min(fin_ventana, serie.fecha_fin)

    fechas = []
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

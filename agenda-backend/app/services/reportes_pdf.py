"""
Generación de reportes PDF (2026-09-07, a petición de Yue; ampliado el
mismo día a petición suya: "no solo dejar unas gráficas y tablas... la
idea es poder utilizarlo para la toma de decisiones" -- de un volcado de
gráficas/tablas pasó a tener resumen ejecutivo, hallazgos/riesgos y
recomendaciones, pensado para que alguien como Bernardo lo pueda leer
sin tener que interpretar los números él mismo).

Arma un HTML simple (sin plantillas de archivo, para no meter Jinja2 como
dependencia extra solo por esto) y lo convierte a PDF con WeasyPrint.
Reusa exactamente los mismos cálculos que ya alimentan el dashboard de
Rendimiento en la web -- ver app/services/rendimiento.py -- así el PDF y la
pantalla nunca pueden mostrar números distintos.

El resumen ejecutivo, hallazgos y recomendaciones se arman con REGLAS
sobre los números ya calculados, NO con un LLM -- a propósito: este PDF
existe para tomar decisiones, y un LLM redactando el resumen podría
"inventar" o redondear mal un número real. Toda frase que aparece aquí
sale de un valor que ya está en `personas`/`aprobacion`/`actividad`/
`resumen`, nunca de texto generado libremente.
"""
from datetime import date
from html import escape

from sqlalchemy.orm import Session

from app.models.proyecto import Proyecto
from app.models.usuario import Usuario
from app.services.rendimiento import (
    Periodo,
    calcular_actividad,
    calcular_rendimiento_equipo,
    calcular_resumen_dashboard,
    calcular_tasa_aprobacion,
)

_ETIQUETA_PERIODO = {"semana": "esta semana", "mes": "este mes", "todo": "todo el historial"}

# Umbral para señalar una tasa de aprobación como foco de atención en
# hallazgos/recomendaciones -- por debajo de esto, y con muestra mínima
# (ver MUESTRA_MINIMA_APROBACION) para no alarmar por 1 solo rechazo.
UMBRAL_TASA_APROBACION_BAJA = 70
MUESTRA_MINIMA_APROBACION = 2


# ---------------------------------------------------------------------
# Resumen ejecutivo / hallazgos / recomendaciones (basados en reglas)
# ---------------------------------------------------------------------


def _construir_resumen_ejecutivo(
    periodo: Periodo, personas: list[dict], aprobacion: list[dict], actividad: dict
) -> list[str]:
    bullets: list[str] = []
    etiqueta = _ETIQUETA_PERIODO.get(periodo, periodo)

    if not personas:
        return [f"No hay tareas registradas para {etiqueta} con los filtros seleccionados."]

    total_completadas = sum(p["completadas"] for p in personas)
    total_asignadas_periodo = sum(p["asignadas_en_periodo"] for p in personas)
    total_vencidas = sum(p["vencidas"] for p in personas)
    total_a_tiempo = sum(p["a_tiempo"] for p in personas)
    pct_a_tiempo = round(total_a_tiempo / total_completadas * 100) if total_completadas else None

    bullets.append(
        f"El equipo ({len(personas)} personas con actividad) completó {total_completadas} "
        f"tarea(s) en {etiqueta}"
        + (f", de las cuales el {pct_a_tiempo}% se entregó a tiempo" if pct_a_tiempo is not None else "")
        + f". Se asignaron {total_asignadas_periodo} tarea(s) nueva(s) en el mismo periodo."
    )

    if total_vencidas > 0:
        personas_con_atraso = sorted((p for p in personas if p["vencidas"] > 0), key=lambda p: -p["vencidas"])
        peor = personas_con_atraso[0]
        bullets.append(
            f"Hay {total_vencidas} tarea(s) vencida(s) en total, repartidas en "
            f"{len(personas_con_atraso)} persona(s). La de mayor atraso es {peor['nombre']} "
            f"({peor['vencidas']} vencida(s), hasta {peor['dias_atraso_max']} día(s))."
        )
    else:
        bullets.append("No hay tareas vencidas en este periodo — la carga activa está al día.")

    con_muestra = [
        p for p in aprobacion if p["tasa_aprobacion"] is not None
        and p["aprobadas"] + p["rechazadas"] >= MUESTRA_MINIMA_APROBACION
    ]
    if con_muestra:
        promedio = round(sum(p["tasa_aprobacion"] for p in con_muestra) / len(con_muestra), 1)
        peor_aprobacion = min(con_muestra, key=lambda p: p["tasa_aprobacion"])
        bullets.append(
            f'La tasa de aprobación promedio en "Visto bueno" es {promedio}%. '
            f"{peor_aprobacion['nombre']} tiene la más baja ({peor_aprobacion['tasa_aprobacion']}%, "
            f"{peor_aprobacion['rechazadas']} rechazo(s))."
        )
    elif aprobacion:
        bullets.append(
            "Hay muy pocas tareas con visto bueno en este periodo para sacar una tasa de "
            "aprobación representativa."
        )

    max_hora = max(actividad["por_hora"], key=lambda h: h["total"], default=None)
    max_dia = max(actividad["por_dia_semana"], key=lambda d: d["total"], default=None)
    if max_hora and max_hora["total"] > 0 and max_dia and max_dia["total"] > 0:
        bullets.append(
            f'La mayor actividad de avance se concentra los {max_dia["dia"]} '
            f'alrededor de las {max_hora["hora"]:02d}:00 horas.'
        )

    return bullets


def _construir_hallazgos(personas: list[dict], aprobacion: list[dict], resumen: dict) -> list[str]:
    hallazgos: list[str] = []

    personas_con_atraso = sorted((p for p in personas if p["vencidas"] > 0), key=lambda p: -p["vencidas"])
    for p in personas_con_atraso[:5]:
        hallazgos.append(
            f"{p['nombre']}: {p['vencidas']} tarea(s) vencida(s), hasta {p['dias_atraso_max']} "
            f"día(s) de atraso (promedio {p['dias_atraso_promedio']} días)."
        )

    for p in aprobacion:
        total = p["aprobadas"] + p["rechazadas"]
        if total >= MUESTRA_MINIMA_APROBACION and p["tasa_aprobacion"] < UMBRAL_TASA_APROBACION_BAJA:
            hallazgos.append(
                f"{p['nombre']}: tasa de aprobación de {p['tasa_aprobacion']}% "
                f"({p['aprobadas']} aprobada(s), {p['rechazadas']} rechazada(s)) — posible foco de "
                "atención en calidad de entrega o claridad de la instrucción."
            )

    if personas:
        carga = sorted(personas, key=lambda p: -p["pendientes_actuales"])
        top = carga[0]
        resto = [p["pendientes_actuales"] for p in carga[1:]]
        promedio_resto = sum(resto) / len(resto) if resto else 0
        if top["pendientes_actuales"] > 0 and (not resto or top["pendientes_actuales"] >= promedio_resto * 2):
            hallazgos.append(
                f"{top['nombre']} concentra {top['pendientes_actuales']} tarea(s) activa(s), "
                "notablemente más que el resto del equipo — posible cuello de botella de carga."
            )

    proyectos_ordenados = sorted(
        (p for p in resumen["por_proyecto"] if p["proyecto_id"] is not None),
        key=lambda p: -p["total"],
    )
    total_tareas = sum(resumen["por_estatus"].values())
    if proyectos_ordenados and total_tareas:
        top_proy = proyectos_ordenados[0]
        pct = round(top_proy["total"] / total_tareas * 100)
        if pct >= 40 and len(proyectos_ordenados) > 1:
            hallazgos.append(
                f'El proyecto "{top_proy["nombre"]}" concentra el {pct}% de las tareas visibles '
                f'({top_proy["total"]} de {total_tareas}).'
            )

    if not hallazgos:
        hallazgos.append("No se detectaron riesgos relevantes en este periodo.")
    return hallazgos


def _construir_recomendaciones(personas: list[dict], aprobacion: list[dict]) -> list[str]:
    recomendaciones: list[str] = []

    personas_con_atraso = sorted((p for p in personas if p["vencidas"] > 0), key=lambda p: -p["vencidas"])
    if personas_con_atraso:
        nombres = ", ".join(p["nombre"] for p in personas_con_atraso[:3])
        recomendaciones.append(
            f"Dar seguimiento directo a las tareas vencidas, priorizando a: {nombres}."
        )

    con_baja_tasa = [
        p for p in aprobacion
        if p["aprobadas"] + p["rechazadas"] >= MUESTRA_MINIMA_APROBACION
        and p["tasa_aprobacion"] < UMBRAL_TASA_APROBACION_BAJA
    ]
    if con_baja_tasa:
        nombres = ", ".join(p["nombre"] for p in con_baja_tasa[:3])
        recomendaciones.append(
            f"Revisar con {nombres} los criterios de entrega antes de marcar una tarea al 100%, "
            "dado su historial reciente de rechazos en el visto bueno."
        )

    if personas:
        carga = sorted(personas, key=lambda p: -p["pendientes_actuales"])
        top = carga[0]
        resto = [p["pendientes_actuales"] for p in carga[1:]]
        promedio_resto = sum(resto) / len(resto) if resto else 0
        if top["pendientes_actuales"] > 0 and (not resto or top["pendientes_actuales"] >= promedio_resto * 2):
            recomendaciones.append(
                f"Evaluar redistribuir parte de la carga activa de {top['nombre']} hacia el resto "
                "del equipo."
            )

    if not recomendaciones:
        recomendaciones.append(
            "El equipo mantiene una operación estable — no se identifican acciones urgentes en "
            "este periodo."
        )
    return recomendaciones


# ---------------------------------------------------------------------
# Fragmentos HTML de las secciones "de datos" (tablas/barras)
# ---------------------------------------------------------------------


def _fila_persona(p: dict) -> str:
    return f"""
    <tr>
      <td>{escape(p["nombre"])}</td>
      <td class="num">{p["completadas"]}</td>
      <td class="num">{p["a_tiempo"]}</td>
      <td class="num">{p["tarde"]}</td>
      <td class="num">{p["pendientes_actuales"]}</td>
      <td class="num">{p["vencidas"]}</td>
      <td class="num">{p["dias_atraso_promedio"]}</td>
    </tr>"""


def _fila_aprobacion(p: dict) -> str:
    tasa = f'{p["tasa_aprobacion"]}%' if p["tasa_aprobacion"] is not None else "—"
    return f"""
    <tr>
      <td>{escape(p["nombre"])}</td>
      <td class="num">{p["aprobadas"]}</td>
      <td class="num">{p["rechazadas"]}</td>
      <td class="num">{tasa}</td>
    </tr>"""


def _barra_actividad(etiqueta: str, total: int, maximo: int) -> str:
    ancho = round(total / maximo * 100) if maximo else 0
    return f"""
    <div class="barra-fila">
      <span class="barra-etiqueta">{escape(str(etiqueta))}</span>
      <div class="barra-pista"><div class="barra-lleno" style="width:{ancho}%"></div></div>
      <span class="barra-total">{total}</span>
    </div>"""


def _lista(items: list[str], clase: str = "") -> str:
    clase_attr = f' class="{clase}"' if clase else ""
    return f"<ul{clase_attr}>" + "".join(f"<li>{escape(i)}</li>" for i in items) + "</ul>"


def generar_pdf_rendimiento(
    db: Session, usuario: Usuario, periodo: Periodo, proyecto_id: int | None = None
) -> bytes:
    personas = calcular_rendimiento_equipo(db, usuario, periodo, proyecto_id)
    resumen = calcular_resumen_dashboard(db, usuario, proyecto_id)
    aprobacion = calcular_tasa_aprobacion(db, usuario, periodo, proyecto_id)
    actividad = calcular_actividad(db, usuario, periodo, proyecto_id)

    nombre_proyecto = None
    if proyecto_id is not None:
        proyecto = db.query(Proyecto).filter(Proyecto.id == proyecto_id).first()
        nombre_proyecto = proyecto.nombre if proyecto else None

    resumen_ejecutivo = _construir_resumen_ejecutivo(periodo, personas, aprobacion, actividad)
    hallazgos = _construir_hallazgos(personas, aprobacion, resumen)
    recomendaciones = _construir_recomendaciones(personas, aprobacion)

    filas_personas = "".join(_fila_persona(p) for p in personas) or (
        '<tr><td colspan="7" class="vacio">Sin datos en este periodo</td></tr>'
    )
    filas_aprobacion = "".join(_fila_aprobacion(p) for p in aprobacion) or (
        '<tr><td colspan="4" class="vacio">Sin tareas con visto bueno en este periodo</td></tr>'
    )

    max_hora = max((h["total"] for h in actividad["por_hora"]), default=0)
    barras_hora = "".join(
        _barra_actividad(f'{h["hora"]:02d}:00', h["total"], max_hora) for h in actividad["por_hora"]
    )
    max_dia = max((d["total"] for d in actividad["por_dia_semana"]), default=0)
    barras_dia = "".join(
        _barra_actividad(d["dia"].capitalize(), d["total"], max_dia)
        for d in actividad["por_dia_semana"]
    )

    estatus = resumen["por_estatus"]
    alcance = f'Proyecto: {nombre_proyecto}' if nombre_proyecto else "Alcance: todos los proyectos visibles"

    html = f"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<style>
  @page {{ size: A4; margin: 2cm; @bottom-center {{ content: "Página " counter(page) " de " counter(pages); font-size: 9px; color: #888; }} }}
  body {{ font-family: 'DejaVu Sans', Arial, sans-serif; color: #1a1a1a; font-size: 12px; line-height: 1.5; }}
  h1 {{ font-size: 20px; margin-bottom: 2px; }}
  .subtitulo {{ color: #555; margin-top: 0; margin-bottom: 20px; }}
  h2 {{ font-size: 14px; margin-top: 28px; margin-bottom: 8px; border-bottom: 2px solid #0f2438; padding-bottom: 4px; }}
  h3 {{ font-size: 12px; margin-top: 16px; margin-bottom: 6px; color: #0f2438; }}
  p.descripcion {{ color: #555; font-size: 10.5px; margin-top: 0; margin-bottom: 10px; }}
  table {{ width: 100%; border-collapse: collapse; margin-bottom: 10px; }}
  th, td {{ padding: 6px 8px; border-bottom: 1px solid #ddd; text-align: left; }}
  th {{ background: #0f2438; color: #fff; font-weight: 600; }}
  td.num, th.num {{ text-align: right; }}
  td.vacio {{ text-align: center; color: #888; font-style: italic; }}
  .resumen-estatus {{ display: flex; gap: 16px; margin-bottom: 10px; }}
  .tarjeta {{ flex: 1; background: #f4f6f8; border-radius: 6px; padding: 10px; text-align: center; }}
  .tarjeta .valor {{ font-size: 20px; font-weight: 700; color: #0f2438; }}
  .tarjeta .etiqueta {{ font-size: 10px; color: #666; }}
  .barra-fila {{ display: flex; align-items: center; gap: 8px; margin-bottom: 3px; }}
  .barra-etiqueta {{ width: 70px; font-size: 10px; color: #444; }}
  .barra-pista {{ flex: 1; background: #eee; border-radius: 3px; height: 10px; overflow: hidden; }}
  .barra-lleno {{ background: #2b6cb0; height: 100%; }}
  .barra-total {{ width: 24px; text-align: right; font-size: 10px; color: #444; }}
  .dos-columnas {{ display: flex; gap: 24px; }}
  .dos-columnas > div {{ flex: 1; }}
  .caja-ejecutiva {{ background: #eef4fb; border-left: 4px solid #2b6cb0; border-radius: 4px; padding: 12px 16px; margin-bottom: 8px; }}
  .caja-ejecutiva ul {{ margin: 0; padding-left: 18px; }}
  .caja-ejecutiva li {{ margin-bottom: 6px; }}
  .caja-riesgo {{ background: #fdf3ec; border-left: 4px solid #b45309; border-radius: 4px; padding: 12px 16px; margin-bottom: 8px; }}
  .caja-riesgo ul {{ margin: 0; padding-left: 18px; }}
  .caja-riesgo li {{ margin-bottom: 6px; }}
  .caja-recomendacion {{ background: #eef8f0; border-left: 4px solid #1f9d55; border-radius: 4px; padding: 12px 16px; margin-bottom: 8px; }}
  .caja-recomendacion ul {{ margin: 0; padding-left: 18px; }}
  .caja-recomendacion li {{ margin-bottom: 6px; }}
  .metodologia {{ font-size: 10px; color: #666; }}
  .metodologia dt {{ font-weight: 600; color: #333; margin-top: 6px; }}
  .metodologia dd {{ margin: 0 0 0 0; }}
</style>
</head>
<body>
  <h1>Reporte de rendimiento</h1>
  <p class="subtitulo">
    Periodo: {_ETIQUETA_PERIODO.get(periodo, periodo).capitalize()} · {alcance} ·
    Generado el {date.today().strftime("%d/%m/%Y")}
  </p>

  <h2>Resumen ejecutivo</h2>
  <p class="descripcion">
    Lectura rápida de los números de este reporte, pensada para tomar decisiones sin tener que
    revisar cada tabla.
  </p>
  <div class="caja-ejecutiva">{_lista(resumen_ejecutivo)}</div>

  <h2>Hallazgos y riesgos</h2>
  <p class="descripcion">Puntos que ameritan atención, detectados automáticamente sobre los datos del periodo.</p>
  <div class="caja-riesgo">{_lista(hallazgos)}</div>

  <h2>Recomendaciones</h2>
  <p class="descripcion">Acciones sugeridas a partir de los hallazgos anteriores.</p>
  <div class="caja-recomendacion">{_lista(recomendaciones)}</div>

  <h2>Estatus general de tareas</h2>
  <div class="resumen-estatus">
    <div class="tarjeta"><div class="valor">{estatus["pendiente"]}</div><div class="etiqueta">Pendiente</div></div>
    <div class="tarjeta"><div class="valor">{estatus["en_progreso"]}</div><div class="etiqueta">En progreso</div></div>
    <div class="tarjeta"><div class="valor">{estatus["pendiente_aprobacion"]}</div><div class="etiqueta">Visto bueno</div></div>
    <div class="tarjeta"><div class="valor">{estatus["cumplido"]}</div><div class="etiqueta">Cumplido</div></div>
  </div>

  <h2>Rendimiento por persona</h2>
  <p class="descripcion">
    "A tiempo"/"Tarde" se miden contra la fecha de entrega. "Vencidas" son tareas activas (no
    cumplidas) cuya fecha límite ya pasó.
  </p>
  <table>
    <thead><tr>
      <th>Persona</th><th class="num">Completadas</th><th class="num">A tiempo</th>
      <th class="num">Tarde</th><th class="num">Pendientes</th><th class="num">Vencidas</th>
      <th class="num">Días atraso prom.</th>
    </tr></thead>
    <tbody>{filas_personas}</tbody>
  </table>

  <h2>Tasa de aprobación ("Visto bueno")</h2>
  <p class="descripcion">
    De las tareas que alguien más asignó (no autoasignadas): cuántas veces se aprobaron vs. se
    rechazaron al llegar a 100% de avance. Una tasa baja con varios rechazos puede señalar
    instrucciones poco claras o entregas de baja calidad.
  </p>
  <table>
    <thead><tr><th>Persona</th><th class="num">Aprobadas</th><th class="num">Rechazadas</th><th class="num">Tasa</th></tr></thead>
    <tbody>{filas_aprobacion}</tbody>
  </table>

  <h2>Actividad</h2>
  <p class="descripcion">
    Momentos del día/semana donde más se actualiza el avance de las tareas -- útil para entender
    patrones reales de trabajo del equipo.
  </p>
  <div class="dos-columnas">
    <div>
      <h3>Por hora del día</h3>
      {barras_hora}
    </div>
    <div>
      <h3>Por día de la semana</h3>
      {barras_dia}
    </div>
  </div>

  <h2>Metodología</h2>
  <dl class="metodologia">
    <dt>Completadas / A tiempo / Tarde</dt>
    <dd>Tareas que llegaron a 100% de avance dentro del periodo seleccionado; a tiempo si fue antes o el mismo día de la fecha de entrega.</dd>
    <dt>Vencidas</dt>
    <dd>Tareas activas (no cumplidas) cuya fecha de entrega ya pasó, sin importar el periodo elegido.</dd>
    <dt>Tasa de aprobación</dt>
    <dd>Aprobadas ÷ (aprobadas + rechazadas) en el flujo de "Visto bueno", que aplica a tareas asignadas por alguien más (no autoasignadas).</dd>
    <dt>Actividad</dt>
    <dd>Cuenta de actualizaciones de porcentaje de avance registradas, agrupadas por hora y día de la semana.</dd>
  </dl>
</body>
</html>"""

    # Import diferido (no al cargar el módulo): WeasyPrint necesita las
    # librerías nativas de GTK/Pango/GObject, que no siempre están
    # disponibles en el entorno (ej. Windows sin el runtime de GTK
    # instalado) -- así el resto de la API arranca igual, y solo esta
    # función puntual falla si de verdad faltan esas librerías.
    from weasyprint import HTML

    return HTML(string=html).write_pdf()

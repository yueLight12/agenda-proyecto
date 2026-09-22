"""
Generación de reportes PDF (2026-09-07, a petición de Yue; ampliado el
mismo día a petición suya: "no solo dejar unas gráficas y tablas... la
idea es poder utilizarlo para la toma de decisiones" -- de un volcado de
gráficas/tablas pasó a tener resumen ejecutivo, hallazgos/riesgos y
recomendaciones, pensado para que alguien como Bernardo lo pueda leer
sin tener que interpretar los números él mismo).

Arma el PDF directo con reportlab (Platypus) -- 2026-09-21, reemplaza al
intento original con WeasyPrint (HTML+CSS -> PDF): WeasyPrint necesita
librerías nativas de sistema (GTK/Pango/GObject) que en esta laptop no se
pudieron instalar (tanto el instalador de GTK como Chocolatey chocaron con
un bloqueo de red hacia los dominios de descarga -- ver la sesión del
2026-09-21). reportlab es Python puro (`pip install reportlab`, sin nada
nativo que compilar ni descargar aparte), así que este problema queda
resuelto de raíz, sin depender de ningún instalador externo.
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
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import ListFlowable, ListItem, Paragraph, SimpleDocTemplate, Table, TableStyle
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
# Construcción del PDF con reportlab (Platypus: flowables sobre un
# SimpleDocTemplate, en vez de HTML+CSS) -- ver docstring del módulo.
# ---------------------------------------------------------------------

_COLOR_PRIMARIO = colors.HexColor("#0f2438")
_COLOR_GRIS = colors.HexColor("#555555")
_COLOR_GRIS_CLARO = colors.HexColor("#888888")
_COLOR_BORDE_TABLA = colors.HexColor("#dddddd")
_COLOR_TARJETA_FONDO = colors.HexColor("#f4f6f8")
_COLOR_BARRA_TRACK = colors.HexColor("#eeeeee")
_COLOR_BARRA_LLENO = colors.HexColor("#2b6cb0")

_COLOR_CAJA_EJECUTIVA = colors.HexColor("#eef4fb")
_COLOR_BORDE_EJECUTIVA = colors.HexColor("#2b6cb0")
_COLOR_CAJA_RIESGO = colors.HexColor("#fdf3ec")
_COLOR_BORDE_RIESGO = colors.HexColor("#b45309")
_COLOR_CAJA_RECOMENDACION = colors.HexColor("#eef8f0")
_COLOR_BORDE_RECOMENDACION = colors.HexColor("#1f9d55")

_ESTILOS = getSampleStyleSheet()
_ESTILO_TITULO = ParagraphStyle(
    "TituloReporte", parent=_ESTILOS["Title"], fontSize=20, leading=24, alignment=TA_LEFT,
    textColor=_COLOR_PRIMARIO, spaceAfter=2,
)
_ESTILO_SUBTITULO = ParagraphStyle(
    "Subtitulo", parent=_ESTILOS["Normal"], fontSize=10, textColor=_COLOR_GRIS, spaceAfter=16,
)
_ESTILO_H2 = ParagraphStyle(
    "H2Reporte", parent=_ESTILOS["Heading2"], fontSize=13, leading=16, textColor=_COLOR_PRIMARIO,
    spaceBefore=16, spaceAfter=4, borderWidth=0,
)
_ESTILO_H3 = ParagraphStyle(
    "H3Reporte", parent=_ESTILOS["Heading3"], fontSize=11, leading=14, textColor=_COLOR_PRIMARIO,
    spaceBefore=8, spaceAfter=4,
)
_ESTILO_DESCRIPCION = ParagraphStyle(
    "Descripcion", parent=_ESTILOS["Normal"], fontSize=9, leading=12, textColor=_COLOR_GRIS,
    spaceAfter=6,
)
_ESTILO_ITEM_CAJA = ParagraphStyle("ItemCaja", parent=_ESTILOS["Normal"], fontSize=9.5, leading=13)
_ESTILO_TARJETA_VALOR = ParagraphStyle(
    "TarjetaValor", parent=_ESTILOS["Normal"], fontSize=18, leading=22, alignment=1,
    textColor=_COLOR_PRIMARIO, fontName="Helvetica-Bold",
)
_ESTILO_TARJETA_ETIQUETA = ParagraphStyle(
    "TarjetaEtiqueta", parent=_ESTILOS["Normal"], fontSize=8.5, leading=11, alignment=1,
    textColor=_COLOR_GRIS,
)
_ESTILO_CELDA = ParagraphStyle("Celda", parent=_ESTILOS["Normal"], fontSize=9, leading=12)
_ESTILO_CELDA_METODOLOGIA_DT = ParagraphStyle(
    "MetodologiaDT", parent=_ESTILOS["Normal"], fontSize=9, leading=12, fontName="Helvetica-Bold",
)
_ESTILO_CELDA_METODOLOGIA_DD = ParagraphStyle(
    "MetodologiaDD", parent=_ESTILOS["Normal"], fontSize=9, leading=12, textColor=_COLOR_GRIS,
)
_ESTILO_BARRA_ETIQUETA = ParagraphStyle("BarraEtiqueta", parent=_ESTILOS["Normal"], fontSize=8.5)
_ESTILO_BARRA_TOTAL = ParagraphStyle(
    "BarraTotal", parent=_ESTILOS["Normal"], fontSize=8.5, alignment=2
)

_ANCHO_PAGINA_UTIL = A4[0] - 2 * 2 * cm  # A4 menos los 2cm de margen a cada lado


def _caja_con_lista(items: list[str], color_fondo, color_borde) -> Table:
    """Equivalente a <div class="caja-*"><ul>...</ul></div> del HTML
    original -- una Table de una sola celda con fondo de color y un borde
    grueso a la izquierda (LINEBEFORE), conteniendo una lista con viñetas."""
    lista = ListFlowable(
        [ListItem(Paragraph(texto, _ESTILO_ITEM_CAJA), spaceBefore=2) for texto in items],
        bulletType="bullet",
        start="•",
        leftIndent=14,
    )
    tabla = Table([[lista]], colWidths=[_ANCHO_PAGINA_UTIL])
    tabla.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), color_fondo),
                ("LINEBEFORE", (0, 0), (0, -1), 4, color_borde),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
                ("LEFTPADDING", (0, 0), (-1, -1), 14),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )
    return tabla


def _tabla_datos(encabezados: list[str], filas: list[list[str]], mensaje_vacio: str) -> Table:
    """Tabla de datos genérica (mismo estilo para "Rendimiento por
    persona" y "Tasa de aprobación") -- encabezado con fondo oscuro,
    primera columna a la izquierda, el resto a la derecha (son números)."""
    if not filas:
        cuerpo = [[Paragraph(mensaje_vacio, _ESTILO_DESCRIPCION)] + [""] * (len(encabezados) - 1)]
        estilo_extra = [("SPAN", (0, 1), (-1, 1))]
    else:
        cuerpo = [[Paragraph(str(c), _ESTILO_CELDA) for c in fila] for fila in filas]
        estilo_extra = []

    datos = [[Paragraph(f"<b>{h}</b>", _ESTILO_CELDA) for h in encabezados]] + cuerpo
    ancho_primera = _ANCHO_PAGINA_UTIL * 0.34
    ancho_resto = (_ANCHO_PAGINA_UTIL - ancho_primera) / (len(encabezados) - 1)
    tabla = Table(datos, colWidths=[ancho_primera] + [ancho_resto] * (len(encabezados) - 1))
    tabla.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), _COLOR_PRIMARIO),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
                ("ALIGN", (0, 0), (0, -1), "LEFT"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LINEBELOW", (0, 0), (-1, -2), 0.5, _COLOR_BORDE_TABLA),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ]
            + estilo_extra
        )
    )
    return tabla


def _tarjetas_estatus(estatus: dict) -> Table:
    definiciones = [
        (estatus["pendiente"], "Pendiente"),
        (estatus["en_progreso"], "En progreso"),
        (estatus["pendiente_aprobacion"], "Visto bueno"),
        (estatus["cumplido"], "Cumplido"),
    ]
    celda = [
        [Paragraph(str(valor), _ESTILO_TARJETA_VALOR), Paragraph(etiqueta, _ESTILO_TARJETA_ETIQUETA)]
        for valor, etiqueta in definiciones
    ]
    # Cada tarjeta es su propia mini-tabla apilada (valor arriba, etiqueta
    # abajo) para poder darle fondo/padding propio; las 4 se acomodan lado
    # a lado en una fila de una tabla contenedora.
    ancho_tarjeta = _ANCHO_PAGINA_UTIL / 4 - 6
    tarjetas = []
    for valor_par, etiqueta_par in celda:
        mini = Table([[valor_par], [etiqueta_par]], colWidths=[ancho_tarjeta])
        mini.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), _COLOR_TARJETA_FONDO),
                    ("TOPPADDING", (0, 0), (-1, 0), 10),
                    ("BOTTOMPADDING", (0, 1), (-1, 1), 10),
                    ("TOPPADDING", (0, 1), (-1, 1), 0),
                    ("BOTTOMPADDING", (0, 0), (-1, 0), 2),
                ]
            )
        )
        tarjetas.append(mini)
    contenedor = Table([tarjetas], colWidths=[ancho_tarjeta] * 4, spaceAfter=8)
    contenedor.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 3), ("RIGHTPADDING", (0, 0), (-1, -1), 3)]))
    return contenedor


def _fila_barra(etiqueta: str, total: int, maximo: int, ancho_pista_pt: float) -> list:
    """Una fila [etiqueta, pista con barra, total] -- la "pista" es una
    celda con fondo gris claro (el track) conteniendo una mini-tabla más
    angosta con fondo azul (el relleno), del ancho proporcional al valor
    -- mismo efecto visual que la barra de progreso CSS original."""
    ancho_lleno = round((total / maximo) * ancho_pista_pt) if maximo else 0
    ancho_lleno = max(ancho_lleno, 1) if total > 0 else 0
    relleno = Table([[""]], colWidths=[max(ancho_lleno, 0.01)], rowHeights=[9])
    relleno.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), _COLOR_BARRA_LLENO)]))
    pista = Table([[relleno]], colWidths=[ancho_pista_pt], rowHeights=[9])
    pista.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), _COLOR_BARRA_TRACK),
                ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    return [Paragraph(str(etiqueta), _ESTILO_BARRA_ETIQUETA), pista, Paragraph(str(total), _ESTILO_BARRA_TOTAL)]


def _tabla_barras(items: list[tuple], ancho_total_pt: float) -> Table:
    """`items`: lista de (etiqueta, total). Arma la columna completa de
    barras (una fila por item) como una sola Table, para que Platypus la
    trate como un bloque y no la corte a la mitad entre página y página."""
    maximo = max((total for _, total in items), default=0)
    ancho_etiqueta = 60
    ancho_total_num = 26
    ancho_pista = ancho_total_pt - ancho_etiqueta - ancho_total_num - 8
    filas = [_fila_barra(etq, total, maximo, ancho_pista) for etq, total in items]
    tabla = Table(filas, colWidths=[ancho_etiqueta, ancho_pista, ancho_total_num])
    tabla.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                ("LEFTPADDING", (0, 0), (-1, -1), 2),
                ("RIGHTPADDING", (0, 0), (-1, -1), 2),
            ]
        )
    )
    return tabla


def _pie_de_pagina(canvas, doc) -> None:
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(_COLOR_GRIS_CLARO)
    texto = f"Página {doc.page}"
    canvas.drawCentredString(A4[0] / 2, 1.2 * cm, texto)
    canvas.restoreState()


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

    estatus = resumen["por_estatus"]
    alcance = f"Proyecto: {nombre_proyecto}" if nombre_proyecto else "Alcance: todos los proyectos visibles"

    story = [
        Paragraph("Reporte de rendimiento", _ESTILO_TITULO),
        Paragraph(
            f"Periodo: {_ETIQUETA_PERIODO.get(periodo, periodo).capitalize()} · {alcance} · "
            f"Generado el {date.today().strftime('%d/%m/%Y')}",
            _ESTILO_SUBTITULO,
        ),
        Paragraph("Resumen ejecutivo", _ESTILO_H2),
        Paragraph(
            "Lectura rápida de los números de este reporte, pensada para tomar decisiones sin "
            "tener que revisar cada tabla.",
            _ESTILO_DESCRIPCION,
        ),
        _caja_con_lista(resumen_ejecutivo, _COLOR_CAJA_EJECUTIVA, _COLOR_BORDE_EJECUTIVA),
        Paragraph("Hallazgos y riesgos", _ESTILO_H2),
        Paragraph(
            "Puntos que ameritan atención, detectados automáticamente sobre los datos del periodo.",
            _ESTILO_DESCRIPCION,
        ),
        _caja_con_lista(hallazgos, _COLOR_CAJA_RIESGO, _COLOR_BORDE_RIESGO),
        Paragraph("Recomendaciones", _ESTILO_H2),
        Paragraph("Acciones sugeridas a partir de los hallazgos anteriores.", _ESTILO_DESCRIPCION),
        _caja_con_lista(recomendaciones, _COLOR_CAJA_RECOMENDACION, _COLOR_BORDE_RECOMENDACION),
        Paragraph("Estatus general de tareas", _ESTILO_H2),
        _tarjetas_estatus(estatus),
        Paragraph("Rendimiento por persona", _ESTILO_H2),
        Paragraph(
            '"A tiempo"/"Tarde" se miden contra la fecha de entrega. "Vencidas" son tareas '
            "activas (no cumplidas) cuya fecha límite ya pasó.",
            _ESTILO_DESCRIPCION,
        ),
        _tabla_datos(
            ["Persona", "Completadas", "A tiempo", "Tarde", "Pendientes", "Vencidas", "Días atraso prom."],
            [
                [p["nombre"], p["completadas"], p["a_tiempo"], p["tarde"], p["pendientes_actuales"], p["vencidas"], p["dias_atraso_promedio"]]
                for p in personas
            ],
            "Sin datos en este periodo",
        ),
        Paragraph('Tasa de aprobación ("Visto bueno")', _ESTILO_H2),
        Paragraph(
            "De las tareas que alguien más asignó (no autoasignadas): cuántas veces se "
            "aprobaron vs. se rechazaron al llegar a 100% de avance. Una tasa baja con varios "
            "rechazos puede señalar instrucciones poco claras o entregas de baja calidad.",
            _ESTILO_DESCRIPCION,
        ),
        _tabla_datos(
            ["Persona", "Aprobadas", "Rechazadas", "Tasa"],
            [
                [p["nombre"], p["aprobadas"], p["rechazadas"], f'{p["tasa_aprobacion"]}%' if p["tasa_aprobacion"] is not None else "—"]
                for p in aprobacion
            ],
            "Sin tareas con visto bueno en este periodo",
        ),
        Paragraph("Actividad", _ESTILO_H2),
        Paragraph(
            "Momentos del día/semana donde más se actualiza el avance de las tareas -- útil "
            "para entender patrones reales de trabajo del equipo.",
            _ESTILO_DESCRIPCION,
        ),
        Paragraph("Por hora del día", _ESTILO_H3),
        _tabla_barras(
            [(f'{h["hora"]:02d}:00', h["total"]) for h in actividad["por_hora"]], _ANCHO_PAGINA_UTIL
        ),
        Paragraph("Por día de la semana", _ESTILO_H3),
        _tabla_barras(
            [(d["dia"].capitalize(), d["total"]) for d in actividad["por_dia_semana"]], _ANCHO_PAGINA_UTIL
        ),
        Paragraph("Metodología", _ESTILO_H2),
        _tabla_metodologia(),
    ]

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
        title="Reporte de rendimiento",
    )
    doc.build(story, onFirstPage=_pie_de_pagina, onLaterPages=_pie_de_pagina)
    return buffer.getvalue()


def _tabla_metodologia() -> Table:
    definiciones = [
        (
            "Completadas / A tiempo / Tarde",
            "Tareas que llegaron a 100% de avance dentro del periodo seleccionado; a tiempo si "
            "fue antes o el mismo día de la fecha de entrega.",
        ),
        (
            "Vencidas",
            "Tareas activas (no cumplidas) cuya fecha de entrega ya pasó, sin importar el "
            "periodo elegido.",
        ),
        (
            "Tasa de aprobación",
            "Aprobadas ÷ (aprobadas + rechazadas) en el flujo de \"Visto bueno\", que aplica a "
            "tareas asignadas por alguien más (no autoasignadas).",
        ),
        (
            "Actividad",
            "Cuenta de actualizaciones de porcentaje de avance registradas, agrupadas por hora "
            "y día de la semana.",
        ),
    ]
    filas = [
        [Paragraph(titulo, _ESTILO_CELDA_METODOLOGIA_DT), Paragraph(texto, _ESTILO_CELDA_METODOLOGIA_DD)]
        for titulo, texto in definiciones
    ]
    ancho_titulo = _ANCHO_PAGINA_UTIL * 0.28
    tabla = Table(filas, colWidths=[ancho_titulo, _ANCHO_PAGINA_UTIL - ancho_titulo])
    tabla.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    return tabla

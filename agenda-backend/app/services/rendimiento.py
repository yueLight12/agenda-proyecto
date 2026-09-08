"""
Servicio de "Rendimiento": métricas de desempeño por persona/proyecto/estatus
(2026-08-26, a petición de Yue -- Bernardo quiere un dashboard visual para
monitorear personas, proyectos y tareas: quién entrega más y a tiempo, quién
tiene más carga, cómo se distribuyen los estatus, cómo va la tendencia).

No inventa una regla de visibilidad nueva: agrega sobre el MISMO conjunto de
entregables que cada quien ya puede ver vía query_entregables_visibles
(mismo patrón de agregación por raíces + cascada de subárbol que ya usa
MiSemana.jsx/CalendarioGlobal.jsx en el frontend) -- así un N2 como David
solo ve las métricas de su propio equipo, y Bernardo, que es N1 local en
casi todos los proyectos, ve las de todos, sin duplicar ni una sola regla
de app/core/permissions.py.
"""
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Literal

from sqlalchemy.orm import Session

from app.core.permissions import query_entregables_visibles
from app.models.entregable import Entregable, EstatusEntregable
from app.models.historial_avance import HistorialAvance
from app.models.nota import Nota
from app.models.usuario import Usuario
from app.services.proyectos import listar_raices_visibles

Periodo = Literal["semana", "mes", "todo"]

# Máximo de proyectos que se muestran sueltos en "carga por proyecto" -- el
# resto se dobla en "Otros" (2026-08-26, ver references/anti-patterns.md del
# skill dataviz: nunca una categoría por cada valor sin límite, mejor un
# balde "Otros" que una barra ilegible de 30 proyectos).
MAX_PROYECTOS_GRAFICA = 8

# Semanas hacia atrás que muestra la gráfica de tendencia, sin importar el
# periodo elegido en el resto del dashboard -- una tendencia necesita
# varios puntos para decirte algo, no tiene sentido acotarla a "esta semana".
SEMANAS_TENDENCIA = 8


def _rango_periodo(periodo: Periodo) -> tuple[date | None, date | None]:
    hoy = date.today()
    if periodo == "semana":
        return hoy - timedelta(days=hoy.weekday()), hoy
    if periodo == "mes":
        return hoy.replace(day=1), hoy
    return None, None


def _entregables_visibles(
    db: Session, usuario: Usuario, proyecto_id: int | None = None
) -> dict[int, Entregable]:
    """Mismo patrón que MiSemana.jsx: raíces visibles -> cascada por
    subárbol vía query_entregables_visibles (ya expande descendientes
    sola), deduplicado por id.

    `proyecto_id` (2026-08-26, a petición de Yue: "buscar por proyecto y
    ver sus métricas") -- si se da, acota TODO el dashboard a ese
    proyecto/tema y su subárbol en vez de todo lo visible; reusa
    query_entregables_visibles tal cual (ya valida que el usuario
    participe ahí -- requerir_participacion_en_proyecto lanza 403/404 si
    no, mismo gate que cualquier otro endpoint de entregables)."""
    if proyecto_id is not None:
        return {e.id: e for e in query_entregables_visibles(db, usuario, proyecto_id).all()}

    entregables: dict[int, Entregable] = {}
    for raiz in listar_raices_visibles(db, usuario):
        for e in query_entregables_visibles(db, usuario, raiz.id).all():
            entregables[e.id] = e
    return entregables


def _primeras_completadas(db: Session, ids: list[int]) -> dict[int, datetime]:
    """Primer momento en que cada entregable llegó a 100% -- el más
    ANTIGUO, no el más reciente, por si el avance se bajó y se volvió a
    subir después."""
    if not ids:
        return {}
    primeras: dict[int, datetime] = {}
    for h in (
        db.query(HistorialAvance)
        .filter(HistorialAvance.entregable_id.in_(ids), HistorialAvance.porcentaje_avance >= 100)
        .order_by(HistorialAvance.entregable_id, HistorialAvance.fecha_registro)
        .all()
    ):
        primeras.setdefault(h.entregable_id, h.fecha_registro)
    return primeras


def calcular_rendimiento_equipo(
    db: Session, usuario: Usuario, periodo: Periodo, proyecto_id: int | None = None
) -> list[dict]:
    inicio, fin = _rango_periodo(periodo)
    entregables = _entregables_visibles(db, usuario, proyecto_id)
    if not entregables:
        return []

    primeras_completadas = _primeras_completadas(db, list(entregables.keys()))

    hoy = date.today()
    personas: dict[int, dict] = {}

    def _fila(usuario_id: int) -> dict:
        if usuario_id not in personas:
            persona = db.query(Usuario).filter(Usuario.id == usuario_id).first()
            personas[usuario_id] = {
                "usuario_id": usuario_id,
                "nombre": persona.nombre if persona else "?",
                "completadas": 0,
                "a_tiempo": 0,
                "tarde": 0,
                "pendientes_actuales": 0,
                "total_asignadas": 0,
                "asignadas_en_periodo": 0,
                "vencidas": 0,
                "dias_atraso_max": 0,
                "proyectos_ids": set(),
                "_dias_atraso_lista": [],
            }
        return personas[usuario_id]

    for e in entregables.values():
        fila = _fila(e.responsable_id)
        fila["proyectos_ids"].add(e.proyecto_id)
        fila["total_asignadas"] += 1

        # "Carga" en dos sabores (2026-08-27, a petición de Yue: quiere
        # elegir entre ver solo lo activo o el volumen histórico completo)
        # -- pendientes_actuales = activas ahora mismo, total_asignadas =
        # todo lo que se le ha asignado sin importar estatus.
        if e.estatus != EstatusEntregable.cumplido:
            fila["pendientes_actuales"] += 1

            # Vencida = pendiente/en_progreso (avance < 100) cuya fecha
            # límite ya pasó -- definición confirmada por Yue el
            # 2026-08-27. Días de atraso = hoy - fecha_entrega.
            if e.fecha_entrega < hoy:
                dias = (hoy - e.fecha_entrega).days
                fila["vencidas"] += 1
                fila["_dias_atraso_lista"].append(dias)
                if dias > fila["dias_atraso_max"]:
                    fila["dias_atraso_max"] = dias

        fecha_completado = primeras_completadas.get(e.id)
        if fecha_completado is not None and (
            inicio is None or inicio <= fecha_completado.date() <= fin
        ):
            fila["completadas"] += 1
            if fecha_completado.date() <= e.fecha_entrega:
                fila["a_tiempo"] += 1
            else:
                fila["tarde"] += 1

        if inicio is None or inicio <= e.fecha_creacion.date() <= fin:
            fila["asignadas_en_periodo"] += 1

    resultado = []
    for fila in personas.values():
        fila["proyectos"] = len(fila.pop("proyectos_ids"))
        dias_lista = fila.pop("_dias_atraso_lista")
        fila["dias_atraso_promedio"] = round(sum(dias_lista) / len(dias_lista), 1) if dias_lista else 0
        resultado.append(fila)
    resultado.sort(key=lambda f: f["completadas"], reverse=True)
    return resultado


def calcular_resumen_dashboard(
    db: Session, usuario: Usuario, proyecto_id: int | None = None
) -> dict:
    """Datos para las 3 gráficas adicionales del dashboard (estatus
    org-wide, carga por proyecto, tendencia semanal) -- snapshot actual, no
    depende del selector de periodo de la tabla de personas (un donut de
    "cómo están las tareas AHORA" y una tendencia de varias semanas no
    tienen "periodo" en el mismo sentido que "completadas esta semana").
    `proyecto_id`: ver _entregables_visibles."""
    entregables = _entregables_visibles(db, usuario, proyecto_id)

    # "pendiente_aprobacion" agregado 2026-09-03 ("Visto bueno") -- sin
    # esto, KeyError real en cuanto exista una tarea en ese estatus (bug
    # encontrado revisando el impacto de agregar el estatus nuevo, no
    # reportado por Yue).
    por_estatus = {"pendiente": 0, "en_progreso": 0, "pendiente_aprobacion": 0, "cumplido": 0}
    conteo_proyecto: dict[int, int] = defaultdict(int)
    nombre_proyecto: dict[int, str] = {}

    for e in entregables.values():
        por_estatus[e.estatus.value] += 1
        conteo_proyecto[e.proyecto_id] += 1
        if e.proyecto_id not in nombre_proyecto:
            nombre_proyecto[e.proyecto_id] = e.proyecto.nombre

    proyectos_ordenados = sorted(conteo_proyecto.items(), key=lambda kv: kv[1], reverse=True)
    por_proyecto = [
        {"proyecto_id": pid, "nombre": nombre_proyecto[pid], "total": total}
        for pid, total in proyectos_ordenados[:MAX_PROYECTOS_GRAFICA]
    ]
    resto = sum(total for _, total in proyectos_ordenados[MAX_PROYECTOS_GRAFICA:])
    if resto:
        por_proyecto.append({"proyecto_id": None, "nombre": "Otros", "total": resto})

    primeras_completadas = _primeras_completadas(db, list(entregables.keys()))
    hoy = date.today()
    inicio_semana_actual = hoy - timedelta(days=hoy.weekday())
    semanas = [
        inicio_semana_actual - timedelta(weeks=n) for n in range(SEMANAS_TENDENCIA - 1, -1, -1)
    ]
    conteo_semana = {s: 0 for s in semanas}
    for fecha_completado in primeras_completadas.values():
        f = fecha_completado.date()
        inicio_de_su_semana = f - timedelta(days=f.weekday())
        if inicio_de_su_semana in conteo_semana:
            conteo_semana[inicio_de_su_semana] += 1

    tendencia = [
        {"etiqueta": f"{s.day:02d}/{s.month:02d}", "completadas": conteo_semana[s]}
        for s in semanas
    ]

    return {"por_estatus": por_estatus, "por_proyecto": por_proyecto, "tendencia": tendencia}


_DIAS_SEMANA_ES = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]


def calcular_tasa_aprobacion(
    db: Session, usuario: Usuario, periodo: Periodo, proyecto_id: int | None = None
) -> list[dict]:
    """Tasa de aprobación en "Visto bueno" por persona (2026-09-07, a
    petición de Yue). No hay un timestamp propio de "cuándo se aprobó" (
    aprobar_entregable no deja rastro, a diferencia de rechazar_entregable
    que sí crea una Nota) -- se usa fecha_creacion del entregable como
    aproximación del periodo, igual que "asignadas_en_periodo" arriba.

    aprobadas = entregables NO autoasignados que ya llegaron a `cumplido`
    (pasaron por el visto bueno, sea que se hayan rechazado antes o no).
    rechazadas = veces que a esa persona le rechazaron algo (una Nota
    "Rechazado: ..." cuenta cada rechazo, no cada entregable -- si le
    rechazan la misma tarea dos veces antes de aprobarla, cuenta doble,
    a propósito: mide fricción real, no solo el resultado final)."""
    inicio, fin = _rango_periodo(periodo)
    entregables = _entregables_visibles(db, usuario, proyecto_id)
    if not entregables:
        return []

    ids = list(entregables.keys())
    personas: dict[int, dict] = {}

    def _fila(usuario_id: int) -> dict:
        if usuario_id not in personas:
            persona = db.query(Usuario).filter(Usuario.id == usuario_id).first()
            personas[usuario_id] = {
                "usuario_id": usuario_id,
                "nombre": persona.nombre if persona else "?",
                "aprobadas": 0,
                "rechazadas": 0,
            }
        return personas[usuario_id]

    for e in entregables.values():
        if e.creado_por == e.responsable_id or e.estatus != EstatusEntregable.cumplido:
            continue
        if inicio is not None and not (inicio <= e.fecha_creacion.date() <= fin):
            continue
        _fila(e.responsable_id)["aprobadas"] += 1

    notas_rechazo = (
        db.query(Nota, Entregable.responsable_id)
        .join(Entregable, Nota.entregable_id == Entregable.id)
        .filter(Entregable.id.in_(ids), Nota.contenido.like("Rechazado:%"))
        .all()
    )
    for nota, responsable_id in notas_rechazo:
        if inicio is not None and not (inicio <= nota.fecha_creacion.date() <= fin):
            continue
        _fila(responsable_id)["rechazadas"] += 1

    resultado = []
    for fila in personas.values():
        total = fila["aprobadas"] + fila["rechazadas"]
        fila["tasa_aprobacion"] = round(fila["aprobadas"] / total * 100, 1) if total else None
        resultado.append(fila)
    resultado.sort(key=lambda f: f["aprobadas"] + f["rechazadas"], reverse=True)
    return resultado


def calcular_actividad(
    db: Session, usuario: Usuario, periodo: Periodo, proyecto_id: int | None = None
) -> dict:
    """Actividad (actualizaciones de avance) por hora del día y por día de
    la semana (2026-09-07, a petición de Yue: "saber cuándo se trabaja
    más") -- usa HistorialAvance.fecha_registro, acotado a los mismos
    entregables visibles, sin importar quién hizo cada actualización
    (es una foto del equipo completo, no por persona)."""
    inicio, fin = _rango_periodo(periodo)
    entregables = _entregables_visibles(db, usuario, proyecto_id)
    if not entregables:
        return {"por_hora": [{"hora": h, "total": 0} for h in range(24)],
                "por_dia_semana": [{"dia": d, "total": 0} for d in _DIAS_SEMANA_ES]}

    ids = list(entregables.keys())
    registros = db.query(HistorialAvance).filter(HistorialAvance.entregable_id.in_(ids)).all()

    por_hora = [0] * 24
    por_dia = [0] * 7
    for r in registros:
        if inicio is not None and not (inicio <= r.fecha_registro.date() <= fin):
            continue
        por_hora[r.fecha_registro.hour] += 1
        por_dia[r.fecha_registro.weekday()] += 1

    return {
        "por_hora": [{"hora": h, "total": por_hora[h]} for h in range(24)],
        "por_dia_semana": [
            {"dia": _DIAS_SEMANA_ES[d], "total": por_dia[d]} for d in range(7)
        ],
    }

"""
Servicio de "Rendimiento": métricas de desempeño por persona (2026-08-26,
a petición de Yue -- Bernardo quiere saber quién entrega más tareas y a
tiempo, quién tiene más carga, cuántos proyectos administra cada quien).

No inventa una regla de visibilidad nueva: agrega, por persona, sobre el
MISMO conjunto de entregables que cada quien ya puede ver vía
query_entregables_visibles (mismo patrón de agregación por raíces + cascada
de subárbol que ya usa MiSemana.jsx/CalendarioGlobal.jsx en el frontend) --
así un N2 como David solo ve el rendimiento de su propio equipo, y Bernardo,
que es N1 local en casi todos los proyectos, ve el de todos, sin duplicar
ni una sola regla de app/core/permissions.py.
"""
from datetime import date, datetime, timedelta
from typing import Literal

from sqlalchemy.orm import Session

from app.core.permissions import query_entregables_visibles
from app.models.entregable import Entregable, EstatusEntregable
from app.models.historial_avance import HistorialAvance
from app.models.usuario import Usuario
from app.services.proyectos import listar_raices_visibles

Periodo = Literal["semana", "mes", "todo"]


def _rango_periodo(periodo: Periodo) -> tuple[date | None, date | None]:
    hoy = date.today()
    if periodo == "semana":
        return hoy - timedelta(days=hoy.weekday()), hoy
    if periodo == "mes":
        return hoy.replace(day=1), hoy
    return None, None


def calcular_rendimiento_equipo(db: Session, usuario: Usuario, periodo: Periodo) -> list[dict]:
    inicio, fin = _rango_periodo(periodo)

    # Mismo patrón que MiSemana.jsx: raíces visibles -> cascada por
    # subárbol vía query_entregables_visibles (ya expande descendientes
    # sola), deduplicado por id.
    entregables: dict[int, Entregable] = {}
    for raiz in listar_raices_visibles(db, usuario):
        for e in query_entregables_visibles(db, usuario, raiz.id).all():
            entregables[e.id] = e

    if not entregables:
        return []

    ids = list(entregables.keys())

    # Primer momento en que cada entregable llegó a 100% (para "a
    # tiempo"/"tarde") -- el más ANTIGUO, no el más reciente, por si el
    # avance se bajó y se volvió a subir después.
    primeras_completadas: dict[int, datetime] = {}
    for h in (
        db.query(HistorialAvance)
        .filter(HistorialAvance.entregable_id.in_(ids), HistorialAvance.porcentaje_avance >= 100)
        .order_by(HistorialAvance.entregable_id, HistorialAvance.fecha_registro)
        .all()
    ):
        primeras_completadas.setdefault(h.entregable_id, h.fecha_registro)

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
                "asignadas_en_periodo": 0,
                "proyectos_ids": set(),
            }
        return personas[usuario_id]

    for e in entregables.values():
        fila = _fila(e.responsable_id)
        fila["proyectos_ids"].add(e.proyecto_id)

        if e.estatus != EstatusEntregable.cumplido:
            fila["pendientes_actuales"] += 1

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
        resultado.append(fila)
    resultado.sort(key=lambda f: f["completadas"], reverse=True)
    return resultado

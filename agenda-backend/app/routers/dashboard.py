"""
Router de dashboard ejecutivo: resumen agregado de TODOS los proyectos
visibles para el usuario actual, para no tener que entrar proyecto por
proyecto a ver el avance (pensado para N1/N2, pero funciona para cualquier
rol ya que reutiliza las mismas reglas de visibilidad que el resto del sistema).
"""
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.permissions import query_entregables_visibles, query_reuniones_visibles
from app.database import get_db
from app.dependencies import obtener_usuario_actual
from app.models.entregable import EstatusEntregable
from app.models.notificacion import Notificacion
from app.models.usuario import Usuario
from app.schemas.dashboard import (
    DashboardOut,
    EntregableAtencionOut,
    ResumenPorProyectoOut,
    ReunionProximaOut,
)
from app.services.proyectos import listar_raices_visibles

router = APIRouter(prefix="/dashboard", tags=["Dashboard ejecutivo"])


@router.get("/resumen", response_model=DashboardOut)
def resumen_dashboard(
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    # Solo las raíces del subárbol visible -- query_entregables_visibles/
    # query_reuniones_visibles ya cascadean solas a todo el subárbol de
    # cada una, así que iterar raíces (en vez de aplanar todo el árbol
    # aquí) trae automáticamente lo de los subtemas sin doble-contar
    # (2026-08-16: antes este router duplicaba su propia query inline y
    # quedaba ciego a subtemas -- ahora reutiliza el mismo servicio que
    # GET /proyectos).
    proyectos = listar_raices_visibles(db, usuario)

    hoy = date.today()
    limite_alerta = hoy + timedelta(days=settings.dias_alerta_entregable)

    resumen_proyectos: list[ResumenPorProyectoOut] = []
    entregables_atencion: list[EntregableAtencionOut] = []
    total_entregables = 0
    total_vencidos = 0
    total_proximos = 0
    total_cumplidos = 0
    suma_avance_ponderada = 0.0

    for proyecto in proyectos:
        entregables = query_entregables_visibles(db, usuario, proyecto.id).all()
        total = len(entregables)
        vencidos = sum(
            1
            for e in entregables
            if e.estatus != EstatusEntregable.cumplido and e.fecha_entrega < hoy
        )
        proximos = sum(
            1
            for e in entregables
            if e.estatus != EstatusEntregable.cumplido
            and hoy <= e.fecha_entrega <= limite_alerta
        )
        cumplidos = sum(1 for e in entregables if e.estatus == EstatusEntregable.cumplido)
        avance = sum(e.porcentaje_avance for e in entregables) / total if total > 0 else 0.0

        for e in entregables:
            if e.estatus == EstatusEntregable.cumplido:
                continue
            if e.fecha_entrega < hoy:
                urgencia = "vencido"
            elif e.fecha_entrega <= limite_alerta:
                urgencia = "proximo"
            else:
                continue
            entregables_atencion.append(
                EntregableAtencionOut(
                    id=e.id,
                    # OJO: e.proyecto (el nodo real donde vive el
                    # entregable), NO la variable `proyecto` del loop (la
                    # raíz del subárbol) -- si viene de un subtema, debe
                    # atribuirse a ESE subtema, no a la raíz.
                    proyecto_id=e.proyecto.id,
                    proyecto_nombre=e.proyecto.nombre,
                    nombre=e.nombre,
                    responsable_id=e.responsable_id,
                    responsable_nombre=e.responsable.nombre,
                    fecha_entrega=e.fecha_entrega,
                    porcentaje_avance=e.porcentaje_avance,
                    estatus=e.estatus,
                    urgencia=urgencia,
                )
            )

        resumen_proyectos.append(
            ResumenPorProyectoOut(
                proyecto_id=proyecto.id,
                proyecto_nombre=proyecto.nombre,
                porcentaje_avance=round(avance, 1),
                total_entregables=total,
                entregables_vencidos=vencidos,
                entregables_proximos_a_vencer=proximos,
            )
        )

        total_entregables += total
        total_vencidos += vencidos
        total_proximos += proximos
        total_cumplidos += cumplidos
        suma_avance_ponderada += avance * total

    avance_global = (
        suma_avance_ponderada / total_entregables if total_entregables > 0 else 0.0
    )

    limite_semana = datetime.utcnow() + timedelta(days=7)
    reuniones_proximas: list[ReunionProximaOut] = []
    for proyecto in proyectos:
        reuniones = query_reuniones_visibles(db, usuario, proyecto.id).all()
        for r in reuniones:
            if datetime.utcnow() <= r.fecha_inicio <= limite_semana:
                reuniones_proximas.append(
                    ReunionProximaOut(
                        id=r.id,
                        proyecto_id=r.proyecto.id,
                        proyecto_nombre=r.proyecto.nombre,
                        titulo=r.titulo,
                        fecha_inicio=r.fecha_inicio,
                        organizador_nombre=r.organizador.nombre,
                    )
                )
    reuniones_proximas.sort(key=lambda r: r.fecha_inicio)

    # Vencidos primero (más vencido primero), luego próximos a vencer.
    entregables_atencion.sort(key=lambda e: (e.urgencia != "vencido", e.fecha_entrega))

    notificaciones_no_leidas = (
        db.query(Notificacion)
        .filter(Notificacion.usuario_id == usuario.id, Notificacion.leida.is_(False))
        .count()
    )

    return DashboardOut(
        porcentaje_avance_global=round(avance_global, 1),
        total_proyectos=len(proyectos),
        total_entregables=total_entregables,
        entregables_vencidos=total_vencidos,
        entregables_proximos_a_vencer=total_proximos,
        entregables_cumplidos=total_cumplidos,
        notificaciones_no_leidas=notificaciones_no_leidas,
        proyectos=resumen_proyectos,
        reuniones_proximas=reuniones_proximas,
        entregables_atencion=entregables_atencion,
    )

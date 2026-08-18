"""
Router de resumen de equipo multi-proyecto: para un N1/N2, agrega en un
solo lugar equipo + entregables + reuniones de TODOS los proyectos donde
participa, agrupado por persona (no por proyecto) — pensado para ver y
administrar su equipo rápido, sin entrar proyecto por proyecto. Reutiliza
`listar_equipo_visible` / `query_entregables_visibles` /
`query_reuniones_visibles` tal cual (ver app/services/equipo_resumen.py);
no define ninguna regla de visibilidad nueva.
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.permissions import proyectos_del_par_jefe_reporte, resolver_jefes_directos
from app.database import get_db
from app.dependencies import obtener_usuario_actual
from app.models.usuario import Usuario
from app.schemas.equipo_resumen import ResumenEquipoOut
from app.schemas.serie_reunion import PendienteRevisionOut
from app.services.equipo_resumen import resumen_equipo_multiproyecto
from app.services.minutas import listar_pendientes_revision, listar_temas_resueltos

router = APIRouter(prefix="/equipo", tags=["Resumen de equipo"])


@router.get("/resumen", response_model=ResumenEquipoOut)
def resumen_equipo(
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    miembros = resumen_equipo_multiproyecto(db, usuario)
    return ResumenEquipoOut(miembros=miembros)


class JefeOut(BaseModel):
    id: int
    nombre: str
    # proyecto_ids de LOS TEMAS de este jefe que ya comparto con él (para
    # que el frontend arme su caja/columna con los mismos temas -- ver
    # ResumenEquipo.jsx, filtra mi propia entrada de /equipo/resumen contra
    # esta lista, sin pedir datos nuevos ni otorgar visibilidad extra).
    proyecto_ids: list[int] = []


@router.get("/mis-jefes", response_model=list[JefeOut])
def mis_jefes(
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """Identidad de quién es mi jefe directo (o jefes, caso matricial) más
    en qué temas -- 2026-08-18, a petición de Yue: "se tiene que ver el
    jefe siempre, con el kanban de todos los temas, como antes, la única
    diferencia es que ya no aparece el botón de checklist". Reutiliza
    resolver_jefes_directos (app/core/permissions.py), no define ninguna
    regla de visibilidad nueva ni escribe nada en la base."""
    return [
        JefeOut(id=j.id, nombre=j.nombre, proyecto_ids=proyectos_del_par_jefe_reporte(db, usuario.id, j.id))
        for j in resolver_jefes_directos(db, usuario.id)
    ]


@router.get("/pendientes-revision", response_model=list[PendienteRevisionOut])
def pendientes_revision(
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """Temas con algo pendiente de revisar en alguna junta -- para el botón
    "Marcar revisado" directo desde Vista Equipo, sin tener que ir a buscar
    la reunión (2026-08-18, a petición de Yue). Ver
    app.services.minutas.listar_pendientes_revision."""
    return listar_pendientes_revision(db, usuario)


@router.get("/temas-resueltos", response_model=list[int])
def temas_resueltos(
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """proyecto_id de temas ya resueltos (nada pendiente de revisar en
    ninguna junta, habiendo tenido algo antes) -- para ocultarlos del árbol
    de Vista Equipo. Ver app.services.minutas.listar_temas_resueltos."""
    return listar_temas_resueltos(db)

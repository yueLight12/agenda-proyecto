"""
Router de Solicitudes de ausencia (vacaciones/permiso/incapacidad).
Toda la lógica vive en app.services.solicitudes_ausencia -- este router
solo valida el schema y arma la respuesta.
"""
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import obtener_usuario_actual
from app.models.usuario import Usuario
from app.schemas.solicitud_ausencia import (
    RechazarSolicitudRequest,
    SolicitudAusenciaCrear,
    SolicitudAusenciaOut,
)
from app.services.solicitudes_ausencia import (
    crear_solicitud as crear_solicitud_servicio,
    listar_visibles,
    resolver_solicitud,
    solicitud_a_out,
)

router = APIRouter(prefix="/solicitudes-ausencia", tags=["Solicitudes de ausencia"])


@router.get("", response_model=list[SolicitudAusenciaOut])
def listar_solicitudes(
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    solicitudes = listar_visibles(db, usuario)
    return [solicitud_a_out(db, usuario, s) for s in solicitudes]


@router.post("", response_model=SolicitudAusenciaOut, status_code=status.HTTP_201_CREATED)
def crear_solicitud(
    datos: SolicitudAusenciaCrear,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    nueva = crear_solicitud_servicio(
        db,
        usuario,
        tipo=datos.tipo,
        fecha_inicio=datos.fecha_inicio,
        fecha_fin=datos.fecha_fin,
        copiados_ids=datos.copiados_ids,
    )
    db.commit()
    db.refresh(nueva)
    return solicitud_a_out(db, usuario, nueva)


@router.patch("/{solicitud_id}/aprobar", response_model=SolicitudAusenciaOut)
def aprobar_solicitud(
    solicitud_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    solicitud = resolver_solicitud(db, usuario, solicitud_id, aprobar=True)
    db.commit()
    db.refresh(solicitud)
    return solicitud_a_out(db, usuario, solicitud)


@router.patch("/{solicitud_id}/rechazar", response_model=SolicitudAusenciaOut)
def rechazar_solicitud(
    solicitud_id: int,
    datos: RechazarSolicitudRequest,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    solicitud = resolver_solicitud(
        db, usuario, solicitud_id, aprobar=False, nota_rechazo=datos.nota_rechazo
    )
    db.commit()
    db.refresh(solicitud)
    return solicitud_a_out(db, usuario, solicitud)

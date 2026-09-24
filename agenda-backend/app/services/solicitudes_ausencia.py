"""
Servicio de "Solicitudes de ausencia" (vacaciones/permiso/incapacidad),
2026-09-23, a petición de Yue. Ver app/models/solicitud_ausencia.py para
el diseño completo.
"""
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.notificacion import TipoNotificacion
from app.models.solicitud_ausencia import (
    EstatusSolicitudAusencia,
    SolicitudAusencia,
    SolicitudAusenciaCopiado,
)
from app.models.usuario import Usuario
from app.schemas.solicitud_ausencia import CopiadoSolicitudOut, SolicitudAusenciaOut
from app.services.equipos import resolver_supervisor_real
from app.services.notificaciones import crear_notificacion

_ETIQUETA_TIPO = {"vacaciones": "vacaciones", "permiso": "permiso", "incapacidad": "incapacidad"}


def crear_solicitud(
    db: Session,
    usuario: Usuario,
    tipo,
    fecha_inicio,
    fecha_fin,
    copiados_ids: list[int] | None = None,
) -> SolicitudAusencia:
    if fecha_fin < fecha_inicio:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La fecha de fin no puede ser anterior a la fecha de inicio.",
        )

    aprobador_id = resolver_supervisor_real(db, usuario.id)

    nueva = SolicitudAusencia(
        solicitante_id=usuario.id,
        aprobador_id=aprobador_id,
        tipo=tipo,
        fecha_inicio=fecha_inicio,
        fecha_fin=fecha_fin,
    )
    db.add(nueva)
    db.flush()

    etiqueta = _ETIQUETA_TIPO.get(tipo.value if hasattr(tipo, "value") else tipo, "ausencia")
    rango = f"{fecha_inicio.strftime('%d/%m/%Y')} al {fecha_fin.strftime('%d/%m/%Y')}"

    if aprobador_id:
        crear_notificacion(
            db,
            aprobador_id,
            TipoNotificacion.otro,
            f"{usuario.nombre} solicitó {etiqueta} del {rango} -- necesita tu aprobación.",
        )
    # Si no se encontró aprobador (ej. Dirección, que no reporta a nadie),
    # la solicitud queda creada pero sin nadie que la resuelva -- se le
    # avisa a quien la creó para que no se quede esperando en silencio.
    else:
        crear_notificacion(
            db,
            usuario.id,
            TipoNotificacion.otro,
            f"Tu solicitud de {etiqueta} quedó registrada, pero no se encontró un "
            "supervisor automático para aprobarla -- coméntalo directamente con Dirección.",
            push=False,
        )

    copiados_ids_filtrados = [
        c for c in dict.fromkeys(copiados_ids or []) if c not in (usuario.id, aprobador_id)
    ]
    for copiado_id in copiados_ids_filtrados:
        db.add(SolicitudAusenciaCopiado(solicitud_id=nueva.id, usuario_id=copiado_id))
        crear_notificacion(
            db,
            copiado_id,
            TipoNotificacion.otro,
            f"{usuario.nombre} te copió en su solicitud de {etiqueta} del {rango} "
            "(vas a poder verla en tu calendario si se aprueba).",
            push=False,
        )

    return nueva


def obtener_solicitud_o_404(db: Session, solicitud_id: int) -> SolicitudAusencia:
    solicitud = db.query(SolicitudAusencia).filter(SolicitudAusencia.id == solicitud_id).first()
    if not solicitud:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    return solicitud


def puede_resolver_solicitud(usuario: Usuario, solicitud: SolicitudAusencia) -> bool:
    if usuario.es_super_admin:
        return True
    return solicitud.aprobador_id == usuario.id


def resolver_solicitud(
    db: Session,
    usuario: Usuario,
    solicitud_id: int,
    aprobar: bool,
    nota_rechazo: str | None = None,
) -> SolicitudAusencia:
    solicitud = obtener_solicitud_o_404(db, solicitud_id)
    if not puede_resolver_solicitud(usuario, solicitud):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo quien debe aprobar esta solicitud puede resolverla.",
        )
    if solicitud.estatus != EstatusSolicitudAusencia.pendiente:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Esta solicitud ya fue resuelta.",
        )

    etiqueta = _ETIQUETA_TIPO.get(
        solicitud.tipo.value if hasattr(solicitud.tipo, "value") else solicitud.tipo, "ausencia"
    )
    rango = f"{solicitud.fecha_inicio.strftime('%d/%m/%Y')} al {solicitud.fecha_fin.strftime('%d/%m/%Y')}"

    if aprobar:
        solicitud.estatus = EstatusSolicitudAusencia.aprobada
        crear_notificacion(
            db,
            solicitud.solicitante_id,
            TipoNotificacion.otro,
            f"{usuario.nombre} aprobó tu solicitud de {etiqueta} del {rango}.",
        )
        for copiado in solicitud.copiados:
            crear_notificacion(
                db,
                copiado.usuario_id,
                TipoNotificacion.otro,
                f"Se aprobó la solicitud de {etiqueta} de {solicitud.solicitante.nombre} "
                f"del {rango} -- ya aparece en tu calendario.",
                push=False,
            )
    else:
        if not nota_rechazo:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Necesitas explicar por qué la rechazas.",
            )
        solicitud.estatus = EstatusSolicitudAusencia.rechazada
        solicitud.nota_rechazo = nota_rechazo
        crear_notificacion(
            db,
            solicitud.solicitante_id,
            TipoNotificacion.otro,
            f'{usuario.nombre} rechazó tu solicitud de {etiqueta} del {rango}: "{nota_rechazo}"',
        )

    solicitud.fecha_resolucion = datetime.utcnow()
    return solicitud


def listar_visibles(db: Session, usuario: Usuario) -> list[SolicitudAusencia]:
    """Mías (como solicitante), las que me toca aprobar, y las aprobadas
    donde estoy copiado (para el calendario) -- ver docstring del modelo."""
    ids_copiado_aprobadas = [
        c.solicitud_id
        for c in db.query(SolicitudAusenciaCopiado)
        .filter(SolicitudAusenciaCopiado.usuario_id == usuario.id)
        .all()
    ]
    return (
        db.query(SolicitudAusencia)
        .filter(
            or_(
                SolicitudAusencia.solicitante_id == usuario.id,
                SolicitudAusencia.aprobador_id == usuario.id,
                SolicitudAusencia.id.in_(ids_copiado_aprobadas),
            )
        )
        .order_by(SolicitudAusencia.fecha_creacion.desc())
        .all()
    )


def solicitud_a_out(db: Session, usuario: Usuario, solicitud: SolicitudAusencia) -> SolicitudAusenciaOut:
    return SolicitudAusenciaOut(
        id=solicitud.id,
        solicitante_id=solicitud.solicitante_id,
        solicitante_nombre=solicitud.solicitante.nombre if solicitud.solicitante else "",
        aprobador_id=solicitud.aprobador_id,
        aprobador_nombre=solicitud.aprobador.nombre if solicitud.aprobador else "",
        tipo=solicitud.tipo,
        fecha_inicio=solicitud.fecha_inicio,
        fecha_fin=solicitud.fecha_fin,
        estatus=solicitud.estatus,
        nota_rechazo=solicitud.nota_rechazo,
        fecha_creacion=solicitud.fecha_creacion,
        fecha_resolucion=solicitud.fecha_resolucion,
        copiados=[
            CopiadoSolicitudOut(usuario_id=c.usuario_id, nombre=c.usuario.nombre)
            for c in solicitud.copiados
            if c.usuario is not None
        ],
        puede_resolver=puede_resolver_solicitud(usuario, solicitud),
    )

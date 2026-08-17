"""
Router de minutas de reunión: notas + acuerdos, con la posibilidad de
convertir un acuerdo en un Entregable real (con responsable y fecha límite).
Toda la lógica vive en app.services.minutas — este router solo valida el
schema de entrada y arma la respuesta.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.permissions import puede_ver_reunion
from app.database import get_db
from app.dependencies import obtener_usuario_actual
from app.models.minuta import Minuta
from app.models.usuario import Usuario
from app.schemas.minuta import (
    AcuerdoCrear,
    AcuerdoOut,
    ConvertirAcuerdoRequest,
    MinutaCrear,
    MinutaOut,
)
from app.schemas.serie_reunion import RevisionAgendaItemOut, RevisionAgendaItemRequest
from app.services.minutas import (
    acuerdo_a_out,
    agregar_acuerdo as agregar_acuerdo_servicio,
    convertir_acuerdo_a_entregable as convertir_acuerdo_a_entregable_servicio,
    crear_o_actualizar_minuta as crear_o_actualizar_minuta_servicio,
    eliminar_acuerdo as eliminar_acuerdo_servicio,
    listar_acuerdos_de_proyecto as listar_acuerdos_de_proyecto_servicio,
    minuta_a_out,
    registrar_revision_agenda_item as registrar_revision_agenda_item_servicio,
)
from app.services.reuniones import obtener_reunion_o_404

router = APIRouter(tags=["Minutas"])


@router.get("/reuniones/{reunion_id}/minuta", response_model=MinutaOut)
def obtener_minuta(
    reunion_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    reunion = obtener_reunion_o_404(db, reunion_id)
    if not puede_ver_reunion(db, usuario, reunion):
        raise HTTPException(status_code=403, detail="No tienes acceso a esta reunión")

    minuta = db.query(Minuta).filter(Minuta.reunion_id == reunion_id).first()
    if not minuta:
        raise HTTPException(status_code=404, detail="Esta reunión todavía no tiene minuta")
    return minuta_a_out(minuta)


@router.post(
    "/reuniones/{reunion_id}/minuta", response_model=MinutaOut, status_code=status.HTTP_201_CREATED
)
def crear_o_actualizar_minuta(
    reunion_id: int,
    datos: MinutaCrear,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """Crea la minuta de la reunión, o actualiza su contenido si ya existía."""
    minuta = crear_o_actualizar_minuta_servicio(db, usuario, reunion_id, datos.contenido)
    db.commit()
    db.refresh(minuta)
    return minuta_a_out(minuta)


@router.get("/proyectos/{proyecto_id}/acuerdos", response_model=list[AcuerdoOut])
def listar_acuerdos_de_proyecto(
    proyecto_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    acuerdos = listar_acuerdos_de_proyecto_servicio(db, usuario, proyecto_id)
    return [acuerdo_a_out(a) for a in acuerdos]


@router.post(
    "/minutas/{minuta_id}/acuerdos", response_model=AcuerdoOut, status_code=status.HTTP_201_CREATED
)
def agregar_acuerdo(
    minuta_id: int,
    datos: AcuerdoCrear,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    acuerdo = agregar_acuerdo_servicio(db, usuario, minuta_id, datos.descripcion, datos.responsable_id)
    db.commit()
    db.refresh(acuerdo)
    return acuerdo_a_out(acuerdo)


@router.delete("/acuerdos/{acuerdo_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_acuerdo(
    acuerdo_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    eliminar_acuerdo_servicio(db, usuario, acuerdo_id)
    db.commit()


@router.post("/acuerdos/{acuerdo_id}/convertir-a-entregable", response_model=AcuerdoOut)
def convertir_acuerdo_a_entregable(
    acuerdo_id: int,
    datos: ConvertirAcuerdoRequest,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """
    Crea un Entregable a partir de este acuerdo (mismo responsable y
    descripción) y lo enlaza. Reutiliza la misma regla que crear un
    entregable normal: N1/N2 pueden asignarlo a quien sea de su equipo,
    N3/N4 solo pueden convertir acuerdos donde ellos son el responsable.
    """
    acuerdo = convertir_acuerdo_a_entregable_servicio(
        db, usuario, acuerdo_id, datos.fecha_entrega, datos.sensible
    )
    db.commit()
    db.refresh(acuerdo)
    return acuerdo_a_out(acuerdo)


@router.post(
    "/reuniones/{reunion_id}/agenda-items/{item_id}/revision",
    response_model=RevisionAgendaItemOut,
    status_code=status.HTTP_201_CREATED,
)
def registrar_revision_agenda_item(
    reunion_id: int,
    item_id: int,
    datos: RevisionAgendaItemRequest,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """Marca el estado de un ítem de la agenda persistente de la serie EN
    esta ocurrencia (checklist de Fase 2) -- ver
    app.services.minutas.registrar_revision_agenda_item."""
    resultado = registrar_revision_agenda_item_servicio(
        db, usuario, reunion_id, item_id, datos.estado, datos.nota, datos.nuevo_pendiente_texto
    )
    db.commit()
    return resultado

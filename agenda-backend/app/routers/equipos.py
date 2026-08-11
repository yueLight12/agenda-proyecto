"""
Router de "mi equipo": plantilla personal reutilizable de personas + rol,
para aplicarla de un clic a un proyecto en vez de asignar una por una cada
vez (ej. "David siempre tiene las mismas 3 personas").

Ver app/models/equipo_miembro.py para el modelo (no está ligado a ningún
proyecto en particular). Aplicar la plantilla a un proyecto sí reutiliza la
tabla usuario_proyecto_rol de siempre — no crea una regla de permisos nueva.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import obtener_usuario_actual
from app.models.equipo_miembro import EquipoMiembro
from app.models.usuario import Usuario
from app.schemas.equipo import EquipoMiembroCrear, EquipoMiembroOut
from app.services.equipos import aplicar_mi_equipo as aplicar_mi_equipo_servicio

router = APIRouter(tags=["Mi equipo"])


def _a_out(registro: EquipoMiembro) -> EquipoMiembroOut:
    return EquipoMiembroOut(
        usuario_id=registro.usuario.id,
        nombre=registro.usuario.nombre,
        puesto=registro.usuario.puesto,
        email=registro.usuario.email,
        rol=registro.rol,
    )


@router.get("/mi-equipo", response_model=list[EquipoMiembroOut])
def listar_mi_equipo(
    db: Session = Depends(get_db), usuario: Usuario = Depends(obtener_usuario_actual)
):
    registros = (
        db.query(EquipoMiembro).filter(EquipoMiembro.propietario_id == usuario.id).all()
    )
    return [_a_out(r) for r in registros]


@router.post("/mi-equipo", response_model=EquipoMiembroOut, status_code=status.HTTP_201_CREATED)
def agregar_a_mi_equipo(
    datos: EquipoMiembroCrear,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """Agrega (o reasigna el rol de) una persona en tu equipo guardado."""
    if datos.usuario_id == usuario.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No puedes agregarte a ti mismo a tu propio equipo",
        )

    existente = (
        db.query(EquipoMiembro)
        .filter(
            EquipoMiembro.propietario_id == usuario.id,
            EquipoMiembro.usuario_id == datos.usuario_id,
        )
        .first()
    )
    if existente:
        existente.rol = datos.rol
        db.commit()
        db.refresh(existente)
        registro = existente
    else:
        registro = EquipoMiembro(
            propietario_id=usuario.id, usuario_id=datos.usuario_id, rol=datos.rol
        )
        db.add(registro)
        db.commit()
        db.refresh(registro)

    return _a_out(registro)


@router.delete("/mi-equipo/{usuario_id}", status_code=status.HTTP_204_NO_CONTENT)
def quitar_de_mi_equipo(
    usuario_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    registro = (
        db.query(EquipoMiembro)
        .filter(
            EquipoMiembro.propietario_id == usuario.id,
            EquipoMiembro.usuario_id == usuario_id,
        )
        .first()
    )
    if not registro:
        raise HTTPException(status_code=404, detail="Ese usuario no está en tu equipo guardado")

    db.delete(registro)
    db.commit()


@router.post("/proyectos/{proyecto_id}/aplicar-mi-equipo", response_model=list[EquipoMiembroOut])
def aplicar_mi_equipo(
    proyecto_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """
    Asigna en este proyecto, de un clic, a todas las personas de tu equipo
    guardado (mismo rol con el que están en la plantilla). Requiere N1/N2 en
    el proyecto. Los N3/N4 quedan supervisados por quien aplica la plantilla.
    """
    resultado = aplicar_mi_equipo_servicio(db, usuario, proyecto_id)
    db.commit()
    return resultado

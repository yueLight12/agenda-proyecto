"""
Router de "mi equipo": plantilla personal reutilizable de personas + rol,
para aplicarla de un clic a un proyecto en vez de asignar una por una cada
vez (ej. "David siempre tiene las mismas 3 personas").

Ver app/models/equipo_miembro.py para el modelo (no está ligado a ningún
proyecto en particular). Aplicar la plantilla a un proyecto sí reutiliza la
tabla usuario_proyecto_rol de siempre — no crea una regla de permisos nueva.
"""
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import obtener_usuario_actual
from app.models.equipo_miembro import EquipoMiembro
from app.models.usuario import Usuario
from app.schemas.equipo import EquipoMiembroCrear, EquipoMiembroOut, PersonaNuevaCrear
from app.schemas.usuario import UsuarioOut
from app.services.equipos import (
    agregar_a_mi_equipo as agregar_a_mi_equipo_servicio,
    aplicar_mi_equipo as aplicar_mi_equipo_servicio,
    crear_persona_y_agregar_a_mi_equipo as crear_persona_y_agregar_a_mi_equipo_servicio,
    listar_equipo_de_subordinado,
    listar_mi_equipo_efectivo,
    listar_usuarios_disponibles as listar_usuarios_disponibles_servicio,
    quitar_de_mi_equipo as quitar_de_mi_equipo_servicio,
)

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
    """Plantilla guardada + tus reportes reales (supervisor_id en algún
    tema), ver listar_mi_equipo_efectivo."""
    return listar_mi_equipo_efectivo(db, usuario)


@router.get("/mi-equipo/{usuario_id}/equipo", response_model=list[EquipoMiembroOut])
def listar_equipo_de(
    usuario_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """Equipo efectivo de `usuario_id` -- solo si es un reporte directo tuyo
    (ver listar_equipo_de_subordinado). Para desplegar/anidar en el
    selector "¿A quién le quieres asignar?" (2026-08-25)."""
    return listar_equipo_de_subordinado(db, usuario, usuario_id)


@router.get("/mi-equipo/usuarios-disponibles", response_model=list[UsuarioOut])
def listar_usuarios_disponibles(
    db: Session = Depends(get_db), usuario: Usuario = Depends(obtener_usuario_actual)
):
    """Usuarios sin rol en ningún proyecto todavía -- para elegir en
    "Agregar existente" (Mi Equipo), abierto a cualquier usuario. Ver
    listar_usuarios_disponibles en app/services/equipos.py para el porqué
    esto no necesita ser N1 a diferencia de GET /usuarios."""
    return listar_usuarios_disponibles_servicio(db)


@router.post("/mi-equipo", response_model=EquipoMiembroOut, status_code=status.HTTP_201_CREATED)
def agregar_a_mi_equipo(
    datos: EquipoMiembroCrear,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """Agrega (o reasigna el rol de) una persona en tu equipo guardado."""
    registro = agregar_a_mi_equipo_servicio(db, usuario, datos.usuario_id, datos.rol)
    db.commit()
    db.refresh(registro)
    return _a_out(registro)


@router.post(
    "/mi-equipo/nueva-persona", response_model=EquipoMiembroOut, status_code=status.HTTP_201_CREATED
)
def agregar_persona_nueva_a_mi_equipo(
    datos: PersonaNuevaCrear,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """Da de alta una cuenta nueva (solo colaborador interno/externo) y la
    agrega de una vez a tu equipo guardado -- para cuando quieres sumar a
    alguien que todavía no tiene cuenta en el sistema, sin pedirle a un N1
    que la cree por ti."""
    registro = crear_persona_y_agregar_a_mi_equipo_servicio(
        db, usuario, datos.nombre, datos.puesto, datos.email, datos.rol
    )
    db.commit()
    db.refresh(registro)
    return _a_out(registro)


@router.delete("/mi-equipo/{usuario_id}", status_code=status.HTTP_204_NO_CONTENT)
def quitar_de_mi_equipo(
    usuario_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    quitar_de_mi_equipo_servicio(db, usuario, usuario_id)
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

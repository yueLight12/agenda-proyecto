"""
Router de proyectos: alta/edición de proyectos y asignación de roles por
proyecto. Toda la lógica vive en app.services.proyectos — este router solo
valida el schema de entrada y arma la respuesta.
"""
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import obtener_usuario_actual
from app.models.usuario import Usuario
from app.schemas.proyecto import (
    AsignarRolRequest,
    MiembroEquipoOut,
    ProyectoActualizar,
    ProyectoCrear,
    ProyectoOut,
)
from app.services.proyectos import (
    asignar_rol_en_proyecto as asignar_rol_en_proyecto_servicio,
    actualizar_proyecto as actualizar_proyecto_servicio,
    crear_proyecto as crear_proyecto_servicio,
    eliminar_proyecto as eliminar_proyecto_servicio,
    listar_equipo_visible,
    listar_proyectos_visibles,
    obtener_proyecto_o_404,
    quitar_miembro_de_proyecto as quitar_miembro_de_proyecto_servicio,
)
from app.core.permissions import requerir_participacion_en_proyecto

router = APIRouter(prefix="/proyectos", tags=["Proyectos"])


@router.get("", response_model=list[ProyectoOut])
def listar_proyectos(
    db: Session = Depends(get_db), usuario: Usuario = Depends(obtener_usuario_actual)
):
    return listar_proyectos_visibles(db, usuario)


@router.post("", response_model=ProyectoOut, status_code=status.HTTP_201_CREATED)
def crear_proyecto(
    datos: ProyectoCrear,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """Cualquier usuario autenticado puede crear un proyecto; queda como N1 de él."""
    nuevo = crear_proyecto_servicio(db, usuario, datos.nombre, datos.descripcion)
    db.commit()
    db.refresh(nuevo)
    return nuevo


@router.get("/{proyecto_id}", response_model=ProyectoOut)
def obtener_proyecto(
    proyecto_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    requerir_participacion_en_proyecto(db, usuario, proyecto_id)
    return obtener_proyecto_o_404(db, proyecto_id)


@router.patch("/{proyecto_id}", response_model=ProyectoOut)
def actualizar_proyecto(
    proyecto_id: int,
    datos: ProyectoActualizar,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    proyecto = actualizar_proyecto_servicio(db, usuario, proyecto_id, datos.model_dump())
    db.commit()
    db.refresh(proyecto)
    return proyecto


@router.delete("/{proyecto_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_proyecto(
    proyecto_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """Elimina el proyecto y todo lo que cuelga de él (equipo, entregables, reuniones). Requiere N1."""
    eliminar_proyecto_servicio(db, usuario, proyecto_id)
    db.commit()


@router.get("/{proyecto_id}/usuarios", response_model=list[MiembroEquipoOut])
def listar_equipo_proyecto(
    proyecto_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """
    Lista el equipo del proyecto, respetando visibilidad:
    - N1: ve a todos.
    - N2: ve a su equipo (los que supervisa) + él mismo.
    - N3/N4: se ven solo a sí mismos.
    """
    return listar_equipo_visible(db, usuario, proyecto_id)


@router.post(
    "/{proyecto_id}/usuarios",
    response_model=MiembroEquipoOut,
    status_code=status.HTTP_201_CREATED,
)
def asignar_rol_en_proyecto(
    proyecto_id: int,
    datos: AsignarRolRequest,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """
    Asigna (o reasigna) el rol de un usuario dentro de un proyecto. Requiere N1 o N2.

    Para N3/N4, si no se manda supervisor_id, queda como supervisor quien está
    haciendo la asignación (sea N1 o N2).
    """
    resultado = asignar_rol_en_proyecto_servicio(
        db, usuario, proyecto_id, datos.usuario_id, datos.rol, datos.supervisor_id
    )
    db.commit()
    return resultado


@router.delete(
    "/{proyecto_id}/usuarios/{usuario_id}", status_code=status.HTTP_204_NO_CONTENT
)
def quitar_miembro_de_proyecto(
    proyecto_id: int,
    usuario_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """Quita a un usuario del proyecto (elimina su rol). Requiere N1 o N2."""
    quitar_miembro_de_proyecto_servicio(db, usuario, proyecto_id, usuario_id)
    db.commit()

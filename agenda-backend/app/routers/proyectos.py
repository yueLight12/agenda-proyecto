"""
Router de proyectos: alta/edición de proyectos/temas (Proyecto anidable a
cualquier profundidad, ver Proyecto.parent_id) y asignación de roles.
Toda la lógica vive en app.services.proyectos — este router solo valida el
schema de entrada y arma la respuesta.
"""
from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import obtener_usuario_actual
from app.models.usuario import Usuario
from app.schemas.proyecto import (
    AsignarRolRequest,
    MiembroEquipoOut,
    ProyectoActualizar,
    ProyectoArbolOut,
    ProyectoCrear,
    ProyectoOut,
)
from app.services.proyectos import (
    asignar_rol_en_proyecto as asignar_rol_en_proyecto_servicio,
    actualizar_proyecto as actualizar_proyecto_servicio,
    crear_proyecto as crear_proyecto_servicio,
    eliminar_proyecto as eliminar_proyecto_servicio,
    listar_ancestros as listar_ancestros_servicio,
    listar_arbol_visible as listar_arbol_visible_servicio,
    listar_equipo_visible,
    listar_hijos_directos as listar_hijos_directos_servicio,
    listar_raices_visibles,
    mover_nodo as mover_nodo_servicio,
    mover_proyecto as mover_proyecto_servicio,
    obtener_proyecto_o_404,
    proyecto_a_out,
    quitar_miembro_de_proyecto as quitar_miembro_de_proyecto_servicio,
    resumen_subarbol as resumen_subarbol_servicio,
)
from app.core.permissions import requerir_participacion_en_proyecto

router = APIRouter(prefix="/proyectos", tags=["Proyectos"])


class MoverNodoRequest(BaseModel):
    nuevo_parent_id: int


class ReordenarRequest(BaseModel):
    direccion: str  # "arriba" | "abajo"


class ResumenSubarbolOut(BaseModel):
    total_subtemas: int
    total_entregables: int
    total_reuniones: int


@router.get("", response_model=list[ProyectoOut])
def listar_proyectos(
    db: Session = Depends(get_db), usuario: Usuario = Depends(obtener_usuario_actual)
):
    """Solo los puntos de entrada (raíces del subárbol visible) -- para
    explorar la profundidad, entrar a cada uno y ver sus /hijos."""
    return [proyecto_a_out(db, usuario, p) for p in listar_raices_visibles(db, usuario)]


@router.post("", response_model=ProyectoOut, status_code=status.HTTP_201_CREATED)
def crear_proyecto(
    datos: ProyectoCrear,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """Sin parent_id: cualquier usuario autenticado puede crear un proyecto
    raíz, queda como N1 de él (o hereda de su plantilla "Mi equipo"). Con
    parent_id: crea un subtema, requiere N1/N2 en el padre."""
    nuevo = crear_proyecto_servicio(
        db, usuario, datos.nombre, datos.descripcion, datos.parent_id, datos.al_frente
    )
    db.commit()
    db.refresh(nuevo)
    return proyecto_a_out(db, usuario, nuevo)


@router.get("/arbol-visible", response_model=list[ProyectoArbolOut])
def listar_arbol_visible(
    db: Session = Depends(get_db), usuario: Usuario = Depends(obtener_usuario_actual)
):
    """Lista plana de TODO el árbol de temas/subtemas visible al usuario
    (no solo raíces) -- para selectores de "elige un tema" que no dependen
    de estar parado en un nodo puntual, ej. el picker de sección del
    checklist de una junta recurrente general. Debe declararse ANTES de
    /{proyecto_id} para que FastAPI no intente resolver "arbol-visible"
    como un id."""
    return listar_arbol_visible_servicio(db, usuario)


@router.get("/{proyecto_id}", response_model=ProyectoOut)
def obtener_proyecto(
    proyecto_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    requerir_participacion_en_proyecto(db, usuario, proyecto_id)
    return proyecto_a_out(db, usuario, obtener_proyecto_o_404(db, proyecto_id))


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
    return proyecto_a_out(db, usuario, proyecto)


@router.delete("/{proyecto_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_proyecto(
    proyecto_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """Elimina el proyecto/tema y TODO su subárbol (equipo, entregables,
    reuniones, subtemas a cualquier profundidad). Requiere N1 o N2."""
    eliminar_proyecto_servicio(db, usuario, proyecto_id)
    db.commit()


@router.get("/{proyecto_id}/hijos", response_model=list[ProyectoOut])
def listar_hijos(
    proyecto_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """Subtemas directos de este nodo (un solo nivel) -- para la sección
    "Subtemas" del tablero de un proyecto/tema."""
    hijos = listar_hijos_directos_servicio(db, usuario, proyecto_id)
    return [proyecto_a_out(db, usuario, h) for h in hijos]


@router.get("/{proyecto_id}/ancestros", response_model=list[ProyectoOut])
def listar_ancestros(
    proyecto_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """Cadena de ancestros (raíz primero) para armar el breadcrumb."""
    ancestros = listar_ancestros_servicio(db, usuario, proyecto_id)
    return [proyecto_a_out(db, usuario, a) for a in ancestros]


@router.get("/{proyecto_id}/resumen-subarbol", response_model=ResumenSubarbolOut)
def resumen_subarbol(
    proyecto_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """Conteo de subtemas/entregables/reuniones que se perderían al
    eliminar este nodo -- para el aviso de confirmación antes de borrar."""
    return resumen_subarbol_servicio(db, usuario, proyecto_id)


@router.patch("/{proyecto_id}/mover", response_model=ProyectoOut)
def mover_nodo(
    proyecto_id: int,
    datos: MoverNodoRequest,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """Mueve un tema/subtema a otro padre. Requiere N1/N2 en el nodo que
    se mueve y en el destino; rechaza mover dentro de su propio subárbol."""
    proyecto = mover_nodo_servicio(db, usuario, proyecto_id, datos.nuevo_parent_id)
    db.commit()
    db.refresh(proyecto)
    return proyecto_a_out(db, usuario, proyecto)


@router.post("/{proyecto_id}/reordenar", status_code=status.HTTP_204_NO_CONTENT)
def reordenar_proyecto(
    proyecto_id: int,
    datos: ReordenarRequest,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """Sube o baja este tema un lugar entre sus hermanos (mismo parent_id),
    para ordenar por importancia en Vista Equipo -- ver
    app.services.proyectos.mover_proyecto. Requiere N1/N2 (local o
    heredado), mismo permiso que editar/eliminar el tema. No confundir con
    PATCH /{proyecto_id}/mover, que reasigna a otro padre (parent_id
    distinto) -- esto solo intercambia posición dentro de la misma lista."""
    mover_proyecto_servicio(db, usuario, proyecto_id, datos.direccion)
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

"""
Endpoints administrativos.

`/admin/generar-recordatorios` es el original del MVP (sin gate de
permiso propio, solo requiere sesión -- dispara a mano el barrido de
recordatorios que normalmente corre solo por scheduler).

El resto (`/admin/reasignar`, `/admin/configuracion`, `/admin/auditoria`)
es nuevo (2026-09-07, a petición de Yue tras preguntar "qué más debería
poder hacer un superadmin"): reasignar en bloque, configurar en caliente,
y ver el registro de auditoría de estas mismas acciones -- todo esto SÍ
requiere superadmin, más estricto que "N1 o super_admin" (ver
requerir_super_admin en app.core.permissions).
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.permissions import requerir_super_admin
from app.database import get_db
from app.dependencies import obtener_usuario_actual
from app.models.usuario import Usuario
from app.schemas.admin import (
    ConfiguracionActualizar,
    ReasignarTodoOut,
    ReasignarTodoRequest,
    RegistroAuditoriaOut,
)
from app.schemas.termino_sensible import TerminoSensibleCrear, TerminoSensibleOut
from app.services import auditoria, configuracion, contenido_sensible
from app.services.admin import reasignar_todo
from app.services.materializar_series import materializar_ocurrencias
from app.services.recordatorios import (
    generar_recordatorios,
    generar_recordatorios_cumpleanos,
    generar_recordatorios_previos_reuniones,
    generar_recordatorios_reuniones_hoy,
)

router = APIRouter(prefix="/admin", tags=["Administración"])


@router.post("/generar-recordatorios")
def disparar_generacion_recordatorios(
    db: Session = Depends(get_db), usuario: Usuario = Depends(obtener_usuario_actual)
):
    """
    Dispara manualmente el barrido de entregables próximos/vencidos, de
    cumpleaños próximos, de reuniones de hoy, y de materialización de
    ocurrencias de series recurrentes -- genera notificaciones. En
    producción esto se debe correr con un scheduler (ver
    app/services/recordatorios.py, app/services/materializar_series.py).
    """
    total_entregables = generar_recordatorios(db)
    total_cumpleanos = generar_recordatorios_cumpleanos(db)
    total_reuniones = generar_recordatorios_reuniones_hoy(db)
    total_recordatorios_previos = generar_recordatorios_previos_reuniones(db)
    ocurrencias_creadas = materializar_ocurrencias(db)
    return {
        "notificaciones_creadas": total_entregables
        + total_cumpleanos
        + total_reuniones
        + total_recordatorios_previos,
        "notificaciones_entregables": total_entregables,
        "notificaciones_cumpleanos": total_cumpleanos,
        "notificaciones_reuniones": total_reuniones,
        "notificaciones_recordatorios_previos": total_recordatorios_previos,
        "ocurrencias_series_creadas": ocurrencias_creadas,
    }


@router.post("/reasignar", response_model=ReasignarTodoOut)
def reasignar(
    datos: ReasignarTodoRequest,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    requerir_super_admin(usuario)
    resultado = reasignar_todo(db, datos.origen_id, datos.destino_id)
    auditoria.registrar(
        db, usuario, "reasignar_todo", datos.origen_id,
        {"destino_id": datos.destino_id, **resultado},
    )
    return resultado


@router.get("/configuracion")
def obtener_configuracion(
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    requerir_super_admin(usuario)
    return configuracion.obtener_todas(db)


@router.put("/configuracion")
def actualizar_configuracion(
    datos: ConfiguracionActualizar,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    requerir_super_admin(usuario)
    try:
        valor = configuracion.establecer(db, usuario, datos.clave, datos.valor)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    auditoria.registrar(db, usuario, "cambiar_configuracion", None, {"clave": datos.clave, "valor": valor})
    return {"clave": datos.clave, "valor": valor}


@router.get("/auditoria", response_model=list[RegistroAuditoriaOut])
def obtener_auditoria(
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    requerir_super_admin(usuario)
    return auditoria.listar_recientes(db)


@router.get("/terminos-sensibles", response_model=list[TerminoSensibleOut])
def obtener_terminos_sensibles(
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """Diccionario de palabras/frases prohibidas -- ver
    app/services/contenido_sensible.py."""
    requerir_super_admin(usuario)
    return contenido_sensible.listar_terminos(db)


@router.post(
    "/terminos-sensibles", response_model=TerminoSensibleOut, status_code=status.HTTP_201_CREATED
)
def agregar_termino_sensible(
    datos: TerminoSensibleCrear,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    requerir_super_admin(usuario)
    termino = contenido_sensible.agregar_termino(db, usuario, datos.texto)
    auditoria.registrar(db, usuario, "agregar_termino_sensible", None, {"texto": termino.texto})
    return termino


@router.delete("/terminos-sensibles/{termino_id}", status_code=status.HTTP_204_NO_CONTENT)
def quitar_termino_sensible(
    termino_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    requerir_super_admin(usuario)
    contenido_sensible.quitar_termino(db, termino_id)
    auditoria.registrar(db, usuario, "quitar_termino_sensible", termino_id)

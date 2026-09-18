"""
Organigrama editable del superadmin (2026-09-17, a petición de Yue: "poder
ver un árbol de quién es jefe-subordinado de quién, y ahí poder ir
moviendo quién es parte del equipo y quién no"). Reutiliza exactamente la
misma tabla de "Mi equipo" (ver app/models/equipo_miembro.py) -- no es un
modelo de datos nuevo, solo una vista/edición a nivel global de lo que
cada jefe ya tenía por separado en su propia plantilla.

Nota: una persona puede tener MÁS de un jefe en los datos reales (ej.
Lucy Berenice Martínez quedó bajo Bernardo Y bajo Diana Chalini a la vez,
detectado el 2026-09-17 al cargar el directorio) -- esto no es
estrictamente un árbol, así que el frontend la muestra una vez por cada
jefe que tenga, sin forzarla a un solo lugar.
"""
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.equipo_miembro import EquipoMiembro
from app.models.usuario import RolEnum, Usuario
from app.schemas.admin import OrganigramaOut, OrganigramaRelacionOut, OrganigramaUsuarioOut
from app.services.equipos import agregar_a_mi_equipo, quitar_de_mi_equipo


def obtener_organigrama(db: Session) -> OrganigramaOut:
    nombres_por_id = dict(db.query(Usuario.id, Usuario.nombre).all())
    relaciones = [
        OrganigramaRelacionOut(
            jefe_id=r.propietario_id,
            jefe_nombre=nombres_por_id.get(r.propietario_id, "?"),
            usuario_id=r.usuario_id,
            usuario_nombre=nombres_por_id.get(r.usuario_id, "?"),
            rol=r.rol,
        )
        for r in db.query(EquipoMiembro).all()
    ]
    usuarios = [
        OrganigramaUsuarioOut(id=u.id, nombre=u.nombre, activo=u.activo)
        for u in db.query(Usuario).order_by(Usuario.nombre).all()
    ]
    return OrganigramaOut(relaciones=relaciones, usuarios=usuarios)


def asignar(db: Session, jefe_id: int, usuario_id: int, rol: RolEnum) -> None:
    if jefe_id == usuario_id:
        raise HTTPException(status_code=400, detail="Una persona no puede ser su propio jefe")
    jefe = db.query(Usuario).filter(Usuario.id == jefe_id).first()
    if not jefe:
        raise HTTPException(status_code=404, detail="Jefe no encontrado")
    if not db.query(Usuario).filter(Usuario.id == usuario_id).first():
        raise HTTPException(status_code=404, detail="Persona no encontrada")
    agregar_a_mi_equipo(db, jefe, usuario_id, rol)


def quitar(db: Session, jefe_id: int, usuario_id: int) -> None:
    jefe = db.query(Usuario).filter(Usuario.id == jefe_id).first()
    if not jefe:
        raise HTTPException(status_code=404, detail="Jefe no encontrado")
    quitar_de_mi_equipo(db, jefe, usuario_id)

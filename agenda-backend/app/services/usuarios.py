"""
Servicio de usuarios: construir el perfil con roles (compartido entre
GET /auth/me y GET /usuarios/{id}/perfil) y decidir quién puede ver el
perfil de quién.
"""
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.permissions import obtener_rol_en_proyecto
from app.models.usuario import RolEnum, Usuario
from app.models.usuario_proyecto_rol import UsuarioProyectoRol
from app.schemas.usuario import RolPorProyectoOut, UsuarioConRolesOut, UsuarioOut


def obtener_usuario_o_404(db: Session, usuario_id: int) -> Usuario:
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return usuario


def usuario_con_roles_a_out(usuario: Usuario) -> UsuarioConRolesOut:
    """Ficha completa de `usuario` -- SIN filtrar sus temas/roles. Úsalo
    solo para el propio usuario autenticado (GET /auth/me). Para la ficha
    de OTRA persona, ver perfil_visible_a_out, que sí filtra."""
    roles = [
        RolPorProyectoOut(
            proyecto_id=r.proyecto_id,
            proyecto_nombre=r.proyecto.nombre,
            rol=r.rol,
            supervisor_id=r.supervisor_id,
        )
        for r in usuario.roles_por_proyecto
    ]
    # Se construye desde UsuarioOut (sin roles) porque validar roles_por_proyecto
    # directamente desde el objeto ORM falla: ese campo requiere proyecto_nombre,
    # que no existe como atributo plano en UsuarioProyectoRol (viene de r.proyecto.nombre).
    base = UsuarioOut.model_validate(usuario)
    return UsuarioConRolesOut(**base.model_dump(), roles_por_proyecto=roles)


def _viewer_ve_fila(db: Session, viewer: Usuario, fila: UsuarioProyectoRol) -> bool:
    """¿El rol efectivo (local o heredado) de `viewer` en el tema de
    `fila` le da visibilidad de esa fila? N1 ve cualquiera; N2 solo a
    quien supervisa LOCALMENTE ahí -- mismo criterio que
    listar_equipo_visible (app/services/proyectos.py)."""
    rol_viewer = obtener_rol_en_proyecto(db, viewer.id, fila.proyecto_id)
    if rol_viewer is None:
        return False
    if rol_viewer.rol == RolEnum.N1:
        return True
    return rol_viewer.rol == RolEnum.N2 and fila.supervisor_id == viewer.id


def usuario_visible_para(db: Session, viewer: Usuario, usuario_id: int) -> bool:
    """¿Puede `viewer` ver la ficha de perfil de `usuario_id`? (2026-08-17,
    "Mi perfil" extendido a ver el de un subordinado, pedido de Yue).
    Uno mismo o super_admin: siempre. Si no, basta con que exista AL MENOS
    un tema donde `viewer` vería la fila del objetivo (ver _viewer_ve_fila)
    -- no expone el directorio completo, solo confirma que hay al menos un
    punto de contacto legítimo."""
    if viewer.id == usuario_id or viewer.es_super_admin:
        return True
    filas_objetivo = (
        db.query(UsuarioProyectoRol).filter(UsuarioProyectoRol.usuario_id == usuario_id).all()
    )
    return any(_viewer_ve_fila(db, viewer, fila) for fila in filas_objetivo)


def perfil_visible_a_out(db: Session, viewer: Usuario, objetivo: Usuario) -> UsuarioConRolesOut:
    """Ficha de OTRA persona, para GET /usuarios/{id}/perfil -- a
    diferencia de usuario_con_roles_a_out, filtra `roles_por_proyecto` a
    solo los temas donde `viewer` también tiene visibilidad legítima
    (mismo criterio que usuario_visible_para, fila por fila); si `viewer`
    es el propio usuario o super_admin, ve la lista completa sin filtrar.
    Así, ver el perfil de alguien no filtra de rebote temas ajenos donde
    esa persona participa pero el viewer no tiene ninguna relación."""
    if viewer.id == objetivo.id or viewer.es_super_admin:
        return usuario_con_roles_a_out(objetivo)

    roles = [
        RolPorProyectoOut(
            proyecto_id=fila.proyecto_id,
            proyecto_nombre=fila.proyecto.nombre,
            rol=fila.rol,
            supervisor_id=fila.supervisor_id,
        )
        for fila in objetivo.roles_por_proyecto
        if _viewer_ve_fila(db, viewer, fila)
    ]
    base = UsuarioOut.model_validate(objetivo)
    return UsuarioConRolesOut(**base.model_dump(), roles_por_proyecto=roles)

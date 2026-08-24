"""
Router de gestión de usuarios.

Nota de diseño: ver/crear/editar en el directorio GLOBAL de usuarios
requiere ser N1 (dirección) en AL MENOS un tema, o ser super admin global
(`usuario.es_super_admin`, ver app.core.permissions). Un Líder (N2) NO
tiene acceso a este directorio -- solo puede administrar SU equipo, tomado
de su propia plantilla "Mi equipo" (ver GET /mi-equipo, app/routers/equipos.py),
decisión explícita de Yue el 2026-08-17. El frontend (ModalEquipo.jsx) ya
refleja esto: para un N2 el selector de "agregar miembro" sale de
GET /mi-equipo, no de este endpoint.

Para dar de alta a alguien que TODAVÍA no tiene cuenta, un N2 ya no
necesita pedirle a un N1 que la cree aquí: puede usar
POST /mi-equipo/nueva-persona (app/routers/equipos.py, decisión de Yue
2026-08-17), que crea la cuenta y la agrega a su plantilla en un solo
paso -- restringido a colaborador interno/externo (N3/N4), nunca
dirección/líder.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.database import get_db
from app.dependencies import obtener_usuario_actual
from app.models.usuario import RolEnum, Usuario
from app.models.usuario_proyecto_rol import UsuarioProyectoRol
from app.schemas.usuario import (
    MiTelefonoActualizar,
    UsuarioActualizar,
    UsuarioConRolesOut,
    UsuarioCrear,
    UsuarioOut,
)
from app.services.usuarios import (
    obtener_usuario_o_404,
    perfil_visible_a_out,
    usuario_visible_para,
)

router = APIRouter(prefix="/usuarios", tags=["Usuarios"])


def _es_n1_en_algun_proyecto(db: Session, usuario: Usuario) -> bool:
    return (
        db.query(UsuarioProyectoRol)
        .filter(
            UsuarioProyectoRol.usuario_id == usuario.id,
            UsuarioProyectoRol.rol == RolEnum.N1,
        )
        .first()
        is not None
    )


def _requerir_n1(db: Session, usuario: Usuario):
    if usuario.es_super_admin:
        return
    if not _es_n1_en_algun_proyecto(db, usuario):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo un usuario con rol de dirección puede realizar esta acción",
        )


@router.get("", response_model=list[UsuarioOut])
def listar_usuarios(
    db: Session = Depends(get_db), usuario: Usuario = Depends(obtener_usuario_actual)
):
    _requerir_n1(db, usuario)
    return db.query(Usuario).all()


@router.post("", response_model=UsuarioOut, status_code=status.HTTP_201_CREATED)
def crear_usuario(
    datos: UsuarioCrear,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    _requerir_n1(db, usuario)

    if db.query(Usuario).filter(Usuario.email == datos.email).first():
        raise HTTPException(status_code=400, detail="Ese email ya está registrado")

    nuevo = Usuario(
        nombre=datos.nombre,
        puesto=datos.puesto,
        email=datos.email,
        password_hash=hash_password(datos.password),
    )
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)
    return nuevo


@router.patch("/me", response_model=UsuarioOut)
def actualizar_mi_telefono(
    datos: MiTelefonoActualizar,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """A diferencia de PATCH /usuarios/{id} (solo dirección), esta ruta la
    usa cualquier usuario para su PROPIO teléfono de WhatsApp (2026-08-24,
    ver "Mi perfil" en el frontend) -- sin _requerir_n1, cada quien es
    dueño de su propio dato de contacto."""
    usuario.telefono_whatsapp = datos.telefono_whatsapp
    db.commit()
    db.refresh(usuario)
    return usuario


@router.get("/{usuario_id}/perfil", response_model=UsuarioConRolesOut)
def obtener_perfil_usuario(
    usuario_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    """Ficha de perfil de OTRO usuario (2026-08-17, "Mi perfil" extendido
    a ver el de un subordinado, pedido de Yue) -- de solo lectura, mismos
    campos que GET /auth/me. NO usa _requerir_n1 (ese gate es para el
    directorio global) -- en cambio, usuario_visible_para replica el
    criterio de listar_equipo_visible sin depender de un tema puntual: te
    ves a ti mismo siempre, o a alguien más si eres N1/N2 (local o
    heredado) de algún tema donde esa persona participa y, si eres N2,
    la supervisas ahí localmente."""
    objetivo = obtener_usuario_o_404(db, usuario_id)
    if not usuario_visible_para(db, usuario, usuario_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes acceso al perfil de este usuario",
        )
    return perfil_visible_a_out(db, usuario, objetivo)


@router.patch("/{usuario_id}", response_model=UsuarioOut)
def actualizar_usuario(
    usuario_id: int,
    datos: UsuarioActualizar,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    _requerir_n1(db, usuario)

    objetivo = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not objetivo:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if datos.nombre is not None:
        objetivo.nombre = datos.nombre
    if datos.puesto is not None:
        objetivo.puesto = datos.puesto
    if datos.activo is not None:
        objetivo.activo = datos.activo
    if datos.password is not None:
        objetivo.password_hash = hash_password(datos.password)

    db.commit()
    db.refresh(objetivo)
    return objetivo

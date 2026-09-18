"""
Esquemas Pydantic: Usuario y autenticación.
"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr

from app.models.usuario import RolEnum


class UsuarioBase(BaseModel):
    nombre: str
    puesto: Optional[str] = None
    email: EmailStr
    telefono_whatsapp: Optional[str] = None


class UsuarioCrear(UsuarioBase):
    password: str


class UsuarioActualizar(BaseModel):
    nombre: Optional[str] = None
    puesto: Optional[str] = None
    activo: Optional[bool] = None
    password: Optional[str] = None
    # 2026-09-07, a petición de Yue: antes solo la propia persona podía
    # poner su teléfono (ver MiTelefonoActualizar/PATCH /usuarios/me) --
    # ahora Dirección (N1) o superadmin también puede ponerlo/corregirlo
    # desde el panel, sin depender de un script.
    telefono_whatsapp: Optional[str] = None
    # Solo un superadmin YA existente puede tocar este campo (2026-09-07,
    # a petición de Yue: "solo un superadmin puede nombrar a otro" -- ni
    # siquiera un N1/Dirección normal, que sí puede editar el resto de
    # estos campos). El router valida esto, no el schema.
    es_super_admin: Optional[bool] = None


class MiTelefonoActualizar(BaseModel):
    """A diferencia de UsuarioActualizar (solo dirección), este campo lo
    edita cualquier usuario sobre sí mismo -- ver PATCH /usuarios/me,
    2026-08-24, necesario para notificaciones por WhatsApp."""

    telefono_whatsapp: Optional[str] = None


class UsuarioOut(UsuarioBase):
    id: int
    activo: bool
    es_super_admin: bool = False
    asistente_voz_habilitado: bool = False
    fecha_creacion: datetime

    class Config:
        from_attributes = True


class RolPorProyectoOut(BaseModel):
    proyecto_id: int
    proyecto_nombre: str
    rol: RolEnum
    supervisor_id: Optional[int] = None

    class Config:
        from_attributes = True


class UsuarioConRolesOut(UsuarioOut):
    roles_por_proyecto: list[RolPorProyectoOut] = []


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class CambiarPasswordRequest(BaseModel):
    password_actual: str
    password_nueva: str

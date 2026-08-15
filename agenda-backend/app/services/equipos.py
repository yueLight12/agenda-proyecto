"""
Servicio de "mi equipo": aplicar la plantilla personal de un usuario a un
proyecto. Usado por el router REST (app/routers/equipos.py) y por el
asistente de voz (app/services/asistente/).
"""
from typing import Optional

from sqlalchemy.orm import Session

from app.core.permissions import requerir_participacion_en_proyecto, requerir_rol_minimo
from app.models.equipo_miembro import EquipoMiembro
from app.models.usuario import RolEnum, Usuario
from app.models.usuario_proyecto_rol import UsuarioProyectoRol
from app.schemas.equipo import EquipoMiembroOut


def rol_default_para_nuevo_proyecto(db: Session, usuario: Usuario) -> tuple[RolEnum, Optional[int]]:
    """N1 por default, salvo que alguien más ya tenga guardado a `usuario` en
    su plantilla de "mi equipo" (EquipoMiembro.usuario_id) -- en ese caso
    hereda ese rol y a esa persona como supervisor, igual que si el dueño de
    la plantilla la hubiera aplicado a mano (ver aplicar_mi_equipo). Usado
    tanto al crear el proyecto de verdad (app/services/proyectos.py) como
    para armar el resumen de confirmación del asistente de voz (tools.py)
    antes de que se ejecute."""
    heredado = (
        db.query(EquipoMiembro)
        .filter(EquipoMiembro.usuario_id == usuario.id)
        .order_by(EquipoMiembro.id)
        .first()
    )
    if not heredado:
        return RolEnum.N1, None
    supervisor_id = heredado.propietario_id if heredado.rol in (RolEnum.N3, RolEnum.N4) else None
    return heredado.rol, supervisor_id


def equipo_miembro_a_out(registro: EquipoMiembro) -> EquipoMiembroOut:
    return EquipoMiembroOut(
        usuario_id=registro.usuario.id,
        nombre=registro.usuario.nombre,
        puesto=registro.usuario.puesto,
        email=registro.usuario.email,
        rol=registro.rol,
    )


def aplicar_mi_equipo(db: Session, usuario: Usuario, proyecto_id: int) -> list[EquipoMiembroOut]:
    """
    Asigna en este proyecto, de un clic, a todas las personas del equipo
    guardado de `usuario` (mismo rol con el que están en la plantilla).
    Requiere N1/N2 en el proyecto. Los N3/N4 quedan supervisados por quien
    aplica la plantilla.
    """
    rol_actual = requerir_participacion_en_proyecto(db, usuario, proyecto_id)
    requerir_rol_minimo(rol_actual, [RolEnum.N1, RolEnum.N2])

    plantilla = db.query(EquipoMiembro).filter(EquipoMiembro.propietario_id == usuario.id).all()

    resultado = []
    for miembro in plantilla:
        existente = (
            db.query(UsuarioProyectoRol)
            .filter(
                UsuarioProyectoRol.usuario_id == miembro.usuario_id,
                UsuarioProyectoRol.proyecto_id == proyecto_id,
            )
            .first()
        )
        supervisor_id = usuario.id if miembro.rol in (RolEnum.N3, RolEnum.N4) else None

        if existente:
            existente.rol = miembro.rol
            existente.supervisor_id = supervisor_id
        else:
            db.add(
                UsuarioProyectoRol(
                    usuario_id=miembro.usuario_id,
                    proyecto_id=proyecto_id,
                    rol=miembro.rol,
                    supervisor_id=supervisor_id,
                )
            )
        resultado.append(equipo_miembro_a_out(miembro))

    return resultado

"""
Servicio de "mi equipo": aplicar la plantilla personal de un usuario a un
proyecto. Usado por el router REST (app/routers/equipos.py) y por el
asistente de voz (app/services/asistente/).
"""
from sqlalchemy.orm import Session

from app.core.permissions import requerir_participacion_en_proyecto, requerir_rol_minimo
from app.models.equipo_miembro import EquipoMiembro
from app.models.usuario import RolEnum, Usuario
from app.models.usuario_proyecto_rol import UsuarioProyectoRol
from app.schemas.equipo import EquipoMiembroOut


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

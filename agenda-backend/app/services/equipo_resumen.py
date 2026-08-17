"""
Servicio de resumen de equipo multi-proyecto: para un N1/N2, agrega en un
solo lugar equipo + entregables + reuniones de TODOS los proyectos donde
participa, agrupado por persona (no por proyecto) — para poder ver y
administrar su equipo sin entrar proyecto por proyecto.

Reutiliza exclusivamente funciones ya existentes de visibilidad
(`listar_proyectos_visibles`, `listar_equipo_visible`,
`query_entregables_visibles`, `query_reuniones_visibles`) — no define
ninguna regla de permisos nueva. En particular, las reuniones que aparecen
aquí son EXACTAMENTE las que `query_reuniones_visibles` ya deja ver hoy
(para roles distintos de N1, solo donde el usuario es organizador o
invitado) — no se amplía esa regla para mostrar "todas las reuniones del
equipo".

Además de lo anterior (que depende 100% de participar en proyectos), se
agrega también a quien esté en la plantilla personal "Mi equipo"
(`EquipoMiembro`, ver app/models/equipo_miembro.py) de quien ve la
pantalla y todavía no haya aparecido por ningún proyecto — con
`proyectos=[]`. Esto es solo para que esa persona no desaparezca del todo
del tablero "Tu equipo" cuando se queda sin ningún proyecto visible (ej.
un N2 recién asignado, o uno que se quedó temporalmente sin proyectos) —
no otorga ninguna visibilidad nueva, ya que sus proyectos/entregables
reales se siguen calculando exactamente igual que para cualquier otra
persona; si de verdad no tiene ninguno visible, quedan vacíos.
"""
from sqlalchemy.orm import Session

from app.core.permissions import (
    obtener_rol_en_proyecto,
    query_entregables_visibles,
    query_reuniones_visibles,
)
from app.models.equipo_miembro import EquipoMiembro
from app.models.usuario import RolEnum, Usuario
from app.schemas.equipo_resumen import (
    EntregableResumenPersonaOut,
    MiembroResumenOut,
    ProyectoDeMiembroOut,
    ReunionResumenPersonaOut,
)
from app.services.proyectos import listar_equipo_visible, listar_proyectos_visibles


def resumen_equipo_multiproyecto(db: Session, usuario: Usuario) -> list[MiembroResumenOut]:
    proyectos = listar_proyectos_visibles(db, usuario)
    personas: dict[int, MiembroResumenOut] = {}

    for proyecto in proyectos:
        equipo = listar_equipo_visible(db, usuario, proyecto.id)
        if not equipo:
            continue

        entregables = query_entregables_visibles(db, usuario, proyecto.id).all()
        reuniones = query_reuniones_visibles(db, usuario, proyecto.id).all()

        if usuario.es_super_admin:
            viewer_puede_administrar = True
        else:
            rol_viewer = obtener_rol_en_proyecto(db, usuario.id, proyecto.id)
            viewer_puede_administrar = rol_viewer is not None and rol_viewer.rol in (
                RolEnum.N1,
                RolEnum.N2,
            )

        for miembro in equipo:
            entregables_de = [
                EntregableResumenPersonaOut(
                    id=e.id,
                    nombre=e.nombre,
                    fecha_entrega=e.fecha_entrega,
                    porcentaje_avance=e.porcentaje_avance,
                    estatus=e.estatus,
                    sensible=e.sensible,
                )
                for e in entregables
                if e.responsable_id == miembro.usuario_id
            ]

            reuniones_de = []
            for r in reuniones:
                if r.organizador_id == miembro.usuario_id:
                    reuniones_de.append(
                        ReunionResumenPersonaOut(
                            id=r.id, titulo=r.titulo, fecha_inicio=r.fecha_inicio, rol_en_reunion="organiza"
                        )
                    )
                elif any(p.usuario_id == miembro.usuario_id for p in r.participantes):
                    reuniones_de.append(
                        ReunionResumenPersonaOut(
                            id=r.id, titulo=r.titulo, fecha_inicio=r.fecha_inicio, rol_en_reunion="invitado"
                        )
                    )

            proyecto_de_miembro = ProyectoDeMiembroOut(
                proyecto_id=proyecto.id,
                proyecto_nombre=proyecto.nombre,
                rol=miembro.rol,
                supervisor_id=miembro.supervisor_id,
                entregables=entregables_de,
                reuniones=reuniones_de,
                viewer_puede_administrar=viewer_puede_administrar,
                parent_id=proyecto.parent_id,
            )

            if miembro.usuario_id not in personas:
                personas[miembro.usuario_id] = MiembroResumenOut(
                    usuario_id=miembro.usuario_id,
                    nombre=miembro.nombre,
                    puesto=miembro.puesto,
                    email=miembro.email,
                    proyectos=[proyecto_de_miembro],
                )
            else:
                personas[miembro.usuario_id].proyectos.append(proyecto_de_miembro)

    plantilla = db.query(EquipoMiembro).filter(EquipoMiembro.propietario_id == usuario.id).all()
    for entrada in plantilla:
        if entrada.usuario_id in personas:
            continue
        personas[entrada.usuario_id] = MiembroResumenOut(
            usuario_id=entrada.usuario_id,
            nombre=entrada.usuario.nombre,
            puesto=entrada.usuario.puesto,
            email=entrada.usuario.email,
            proyectos=[],
        )

    resultado = list(personas.values())
    resultado.sort(key=lambda m: (m.usuario_id != usuario.id, m.nombre))
    return resultado

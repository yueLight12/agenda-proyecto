"""
Servicio de reuniones: crear, editar, eliminar y convertir a schema de
salida. Usado por el router REST (app/routers/reuniones.py) y por el
asistente de voz (app/services/asistente/), para no duplicar las reglas de
permisos (app.core.permissions) ni la construcción de ReunionOut.
"""
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.permissions import puede_editar_reunion, requerir_participacion_en_proyecto
from app.models.equipo_miembro import EquipoMiembro
from app.models.notificacion import Notificacion, TipoNotificacion
from app.models.reunion import Reunion, ReunionParticipante
from app.models.usuario import RolEnum, Usuario
from app.models.usuario_proyecto_rol import UsuarioProyectoRol
from app.schemas.proyecto import MiembroEquipoOut
from app.schemas.reunion import ParticipanteOut, ReunionOut
from app.services.proyectos import listar_equipo_visible


def reunion_a_out(db: Session, usuario: Usuario, reunion: Reunion) -> ReunionOut:
    return ReunionOut(
        id=reunion.id,
        proyecto_id=reunion.proyecto_id,
        titulo=reunion.titulo,
        notas=reunion.notas,
        fecha_inicio=reunion.fecha_inicio,
        duracion_minutos=reunion.duracion_minutos,
        organizador_id=reunion.organizador_id,
        organizador_nombre=reunion.organizador.nombre,
        participantes=[
            ParticipanteOut(usuario_id=p.usuario_id, nombre=p.usuario.nombre)
            for p in reunion.participantes
        ],
        puede_editar=puede_editar_reunion(db, usuario, reunion),
        serie_id=reunion.serie_id,
    )


def obtener_reunion_o_404(db: Session, reunion_id: int) -> Reunion:
    reunion = db.query(Reunion).filter(Reunion.id == reunion_id).first()
    if not reunion:
        raise HTTPException(status_code=404, detail="Reunión no encontrada")
    return reunion


def _fila_a_miembro(fila: UsuarioProyectoRol) -> MiembroEquipoOut:
    return MiembroEquipoOut(
        usuario_id=fila.usuario.id,
        nombre=fila.usuario.nombre,
        puesto=fila.usuario.puesto,
        email=fila.usuario.email,
        rol=fila.rol,
        supervisor_id=fila.supervisor_id,
    )


def listar_invitables_reunion(
    db: Session, usuario: Usuario, proyecto_id: int | None
) -> list[MiembroEquipoOut]:
    """
    A quién se puede invitar a una reunión/junta -- pedido explícito de Yue
    (2026-08-17): "quisiera que un subordinado pueda agregar a su jefe a
    juntas". Deliberadamente MÁS permisiva que listar_equipo_visible (que
    sigue intacta y es la que manda para "Administrar equipo"/asignar
    roles) -- invitar a alguien a una reunión es una acción de mucho menor
    alcance que administrar su rol, así que aquí se le suma a cada quien,
    además de lo que ya podía ver:

    - Con `proyecto_id` (reunión/junta de un tema): todo N1 LOCAL de ese
      tema (Dirección), y el propio supervisor directo del usuario en ese
      tema (UsuarioProyectoRol.supervisor_id), si tiene uno.
    - Sin `proyecto_id` (junta general): cualquier persona que sea N1
      LOCAL en al menos uno de los temas donde el usuario tiene una fila
      propia, y su supervisor directo en cualquiera de esos temas -- así
      Diana puede invitar a Bernardo a una junta general sin tener que
      guardarlo antes en su plantilla "Mi equipo".

    Simplificación consciente: solo mira roles N1 LOCALES (fila explícita
    en ese proyecto_id exacto), no resuelve herencia de un ancestro lejano
    -- suficiente para la estructura real de datos (Bernardo siempre tiene
    fila local N1 en cada tema de David/Diana). No cambia ninguna regla de
    permisos existente, es una lista nueva y aparte.
    """
    vistos: dict[int, MiembroEquipoOut] = {}

    def agregar(m: MiembroEquipoOut) -> None:
        if m.usuario_id != usuario.id:
            vistos[m.usuario_id] = m

    if proyecto_id is not None:
        requerir_participacion_en_proyecto(db, usuario, proyecto_id)
        for m in listar_equipo_visible(db, usuario, proyecto_id):
            agregar(m)

        filas = (
            db.query(UsuarioProyectoRol)
            .filter(UsuarioProyectoRol.proyecto_id == proyecto_id)
            .all()
        )
        for fila in filas:
            if fila.rol == RolEnum.N1:
                agregar(_fila_a_miembro(fila))

        mi_fila = next((f for f in filas if f.usuario_id == usuario.id), None)
        if mi_fila and mi_fila.supervisor_id is not None:
            fila_supervisor = next(
                (f for f in filas if f.usuario_id == mi_fila.supervisor_id), None
            )
            if fila_supervisor:
                agregar(_fila_a_miembro(fila_supervisor))
    else:
        plantilla = (
            db.query(EquipoMiembro).filter(EquipoMiembro.propietario_id == usuario.id).all()
        )
        for m in plantilla:
            agregar(
                MiembroEquipoOut(
                    usuario_id=m.usuario.id,
                    nombre=m.usuario.nombre,
                    puesto=m.usuario.puesto,
                    email=m.usuario.email,
                    rol=m.rol,
                    supervisor_id=None,
                )
            )

        mis_filas = (
            db.query(UsuarioProyectoRol)
            .filter(UsuarioProyectoRol.usuario_id == usuario.id)
            .all()
        )
        proyecto_ids = {f.proyecto_id for f in mis_filas}
        supervisor_ids = {f.supervisor_id for f in mis_filas if f.supervisor_id is not None}

        if proyecto_ids:
            filas_n1 = (
                db.query(UsuarioProyectoRol)
                .filter(
                    UsuarioProyectoRol.proyecto_id.in_(proyecto_ids),
                    UsuarioProyectoRol.rol == RolEnum.N1,
                )
                .all()
            )
            for fila in filas_n1:
                agregar(_fila_a_miembro(fila))

        if supervisor_ids:
            filas_supervisores = (
                db.query(UsuarioProyectoRol)
                .filter(
                    UsuarioProyectoRol.usuario_id.in_(supervisor_ids),
                    UsuarioProyectoRol.proyecto_id.in_(proyecto_ids),
                )
                .all()
            )
            for fila in filas_supervisores:
                agregar(_fila_a_miembro(fila))

    return list(vistos.values())


def crear_reunion(
    db: Session,
    usuario: Usuario,
    proyecto_id: int | None,
    titulo: str,
    notas: str | None,
    fecha_inicio,
    duracion_minutos: int,
    participantes_ids: list[int],
) -> Reunion:
    """
    Cualquier participante del proyecto puede agendar una reunión (no requiere
    N1/N2, a diferencia de los entregables): un N2 puede citar a otro N2 o al
    N1, por ejemplo. Queda visible solo para organizador + invitados (y N1).
    Notifica in-app a cada invitado (tipo `otro`, mismo patrón que las notas —
    no hay un tipo de notificación dedicado a reuniones), excluyendo al
    organizador.

    proyecto_id=None (2026-08-16): reunión "general", sin tema -- cualquier
    usuario autenticado puede agendar una (no hay proyecto del que exigir
    participación), visible solo para organizador + invitados.
    """
    if proyecto_id is not None:
        requerir_participacion_en_proyecto(db, usuario, proyecto_id)

    nueva = Reunion(
        proyecto_id=proyecto_id,
        titulo=titulo,
        notas=notas,
        fecha_inicio=fecha_inicio,
        duracion_minutos=duracion_minutos,
        organizador_id=usuario.id,
    )
    db.add(nueva)
    db.flush()

    for uid in set(participantes_ids) - {usuario.id}:
        db.add(ReunionParticipante(reunion_id=nueva.id, usuario_id=uid))
        db.add(
            Notificacion(
                usuario_id=uid,
                tipo=TipoNotificacion.otro,
                mensaje=f'{usuario.nombre} te invitó a la reunión "{titulo}" '
                f'el {fecha_inicio.strftime("%d/%m/%Y a las %H:%M")}.',
            )
        )

    return nueva


def actualizar_reunion(db: Session, usuario: Usuario, reunion_id: int, campos: dict) -> Reunion:
    reunion = obtener_reunion_o_404(db, reunion_id)
    if not puede_editar_reunion(db, usuario, reunion):
        raise HTTPException(status_code=403, detail="No tienes permiso para editar esta reunión")

    participantes_ids = campos.pop("participantes_ids", None)

    for campo, valor in campos.items():
        setattr(reunion, campo, valor)

    if participantes_ids is not None:
        db.query(ReunionParticipante).filter(
            ReunionParticipante.reunion_id == reunion.id
        ).delete()
        for uid in set(participantes_ids) - {reunion.organizador_id}:
            db.add(ReunionParticipante(reunion_id=reunion.id, usuario_id=uid))

    return reunion


def eliminar_reunion(db: Session, usuario: Usuario, reunion_id: int) -> None:
    reunion = obtener_reunion_o_404(db, reunion_id)
    if not puede_editar_reunion(db, usuario, reunion):
        raise HTTPException(
            status_code=403, detail="No tienes permiso para eliminar esta reunión"
        )
    # Notificacion no cascada por relación ORM (no es un hijo propiamente
    # dicho) — se limpia a mano, igual que en eliminar_proyecto.
    # AgendaItemRevision SÍ cascada, pero a nivel de base de datos (ON
    # DELETE CASCADE en la FK, ver app/models/agenda_item.py) en vez de
    # relación ORM -- cubre también el borrado en cascada de un tema
    # completo, sin depender de que cada lugar que borra una Reunion se
    # acuerde de limpiarlo a mano.
    db.query(Notificacion).filter(Notificacion.reunion_id == reunion.id).delete(
        synchronize_session=False
    )
    db.delete(reunion)

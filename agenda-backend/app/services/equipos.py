"""
Servicio de "mi equipo": aplicar la plantilla personal de un usuario a un
proyecto. Usado por el router REST (app/routers/equipos.py) y por el
asistente de voz (app/services/asistente/).
"""
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.permissions import (
    obtener_rol_en_proyecto,
    requerir_participacion_en_proyecto,
    requerir_rol_minimo,
)
from app.core.security import hash_password
from app.models.equipo_miembro import EquipoMiembro
from app.models.usuario import RolEnum, Usuario
from app.models.usuario_proyecto_rol import UsuarioProyectoRol
from app.schemas.equipo import EquipoMiembroOut, ProyectoDeMiembroSimpleOut

# Misma contraseña por defecto que seed_usuarios_reales.py/reset_passwords_reales.py
# -- la persona la cambia desde "Cambiar contraseña" en su primer login.
PASSWORD_DEFECTO_PERSONA_NUEVA = "Demo1234!"


def rol_default_para_nuevo_proyecto(db: Session, usuario: Usuario) -> tuple[RolEnum, Optional[int]]:
    """N1 por default, salvo que alguien más ya tenga guardado a `usuario` en
    su plantilla de "mi equipo" (EquipoMiembro.usuario_id) -- en ese caso
    hereda ese rol, igual que si el dueño de la plantilla la hubiera
    aplicado a mano (ver aplicar_mi_equipo). El segundo valor devuelto es el
    id del DUEÑO de esa plantilla, a agregar también al proyecto nuevo (ver
    crear_proyecto): si `usuario` hereda N3/N4, el dueño queda como su
    supervisor (N2); si hereda N2, el dueño queda como dirección (N1) --
    sin esto, un N2 recién creado se queda sin nadie con permiso para
    terminar de organizar su propio equipo (asignar roles requiere N1/N2),
    y una instrucción compuesta tipo "crea el proyecto y pon a Fulano de
    líder" se rompería justo ahí. Si hereda N1, no hay nadie que agregar --
    ya tiene control total. Usado tanto al crear el proyecto de verdad
    (app/services/proyectos.py) como para armar el resumen de confirmación
    del asistente de voz (tools.py) antes de que se ejecute."""
    heredado = (
        db.query(EquipoMiembro)
        .filter(EquipoMiembro.usuario_id == usuario.id)
        .order_by(EquipoMiembro.id)
        .first()
    )
    if not heredado:
        return RolEnum.N1, None
    dueno_id = heredado.propietario_id if heredado.rol in (RolEnum.N2, RolEnum.N3, RolEnum.N4) else None
    return heredado.rol, dueno_id


def equipo_miembro_a_out(registro: EquipoMiembro) -> EquipoMiembroOut:
    return EquipoMiembroOut(
        usuario_id=registro.usuario.id,
        nombre=registro.usuario.nombre,
        puesto=registro.usuario.puesto,
        email=registro.usuario.email,
        rol=registro.rol,
    )


def _proyectos_administrables_de(db: Session, viewer: Usuario, miembro_id: int) -> list[ProyectoDeMiembroSimpleOut]:
    """Temas donde `miembro_id` participa y `viewer` puede administrar
    (N1/N2 local, o super_admin) -- para el selector de tema de "Asignar
    tarea a mi equipo" (2026-08-22, ver ModalAsignarTareaRapida.jsx, que
    filtra exactamente por viewer_puede_administrar). No usa
    listar_proyectos_visibles(viewer) porque el punto es precisamente
    poder asignarle una tarea a alguien en un tema que el viewer administra
    aunque él mismo no tenga entregables ahí -- solo importa su rol."""
    filas = db.query(UsuarioProyectoRol).filter(UsuarioProyectoRol.usuario_id == miembro_id).all()
    resultado = []
    for fila in filas:
        if viewer.es_super_admin:
            puede_administrar = True
        else:
            rol_viewer = obtener_rol_en_proyecto(db, viewer.id, fila.proyecto_id)
            puede_administrar = rol_viewer is not None and rol_viewer.rol in (RolEnum.N1, RolEnum.N2)
        if not puede_administrar:
            continue
        resultado.append(
            ProyectoDeMiembroSimpleOut(
                proyecto_id=fila.proyecto_id,
                proyecto_nombre=fila.proyecto.nombre,
                viewer_puede_administrar=True,
            )
        )
    return resultado


def listar_mi_equipo_efectivo(db: Session, usuario: Usuario) -> list[EquipoMiembroOut]:
    """Plantilla guardada + reportes reales (supervisor_id == usuario.id en
    cualquier tema, ver UsuarioProyectoRol) que todavía no estén guardados
    ahí -- para que "Administrar equipo" no obligue a guardar a mano a
    alguien que ya es tu reporte real en un tema (2026-08-17, a petición de
    Yue: Ana/Iván/Juan José debían aparecer bajo David sin tener que
    guardarlos primero). Los reportes reales se listan de solo lectura
    (`guardado=False`) -- no crean una fila EquipoMiembro nueva, así que
    aplicar_mi_equipo (que sigue leyendo solo la plantilla guardada, sin
    cambios) no se ve afectado por este merge de solo-listado."""
    plantilla = db.query(EquipoMiembro).filter(EquipoMiembro.propietario_id == usuario.id).all()
    resultado = [
        EquipoMiembroOut(
            usuario_id=m.usuario.id,
            nombre=m.usuario.nombre,
            puesto=m.usuario.puesto,
            email=m.usuario.email,
            rol=m.rol,
            guardado=True,
            proyectos=_proyectos_administrables_de(db, usuario, m.usuario.id),
        )
        for m in plantilla
    ]
    ids_ya = {m.usuario_id for m in plantilla}

    reportes = (
        db.query(UsuarioProyectoRol)
        .filter(UsuarioProyectoRol.supervisor_id == usuario.id)
        .order_by(UsuarioProyectoRol.usuario_id, UsuarioProyectoRol.id)
        .all()
    )
    vistos = set()
    for fila in reportes:
        if fila.usuario_id in ids_ya or fila.usuario_id in vistos:
            continue
        vistos.add(fila.usuario_id)
        resultado.append(
            EquipoMiembroOut(
                usuario_id=fila.usuario.id,
                nombre=fila.usuario.nombre,
                puesto=fila.usuario.puesto,
                email=fila.usuario.email,
                rol=fila.rol,
                guardado=False,
                proyectos=_proyectos_administrables_de(db, usuario, fila.usuario.id),
            )
        )
    return resultado


def listar_equipo_de_subordinado(
    db: Session, viewer: Usuario, usuario_id: int
) -> list[EquipoMiembroOut]:
    """Equipo efectivo de `usuario_id`, visible solo si es un reporte
    DIRECTO de `viewer` (2026-08-25, a petición de Yue: en el selector
    "¿A quién le quieres asignar?" quiere poder desplegar el equipo de un
    líder -- ej. Bernardo despliega el de Diana y ve a Lucy/Grecia debajo --
    sin exponer niveles más abajo de los que el propio viewer administra).
    Un solo nivel: no es recursivo -- si Diana desplegara el equipo de Lucy,
    eso sería una llamada aparte que requeriría que Diana sea viewer, no
    Bernardo. 404 en vez de 403 para no revelar si el usuario_id existe."""
    equipo_viewer = listar_mi_equipo_efectivo(db, viewer)
    if not any(m.usuario_id == usuario_id for m in equipo_viewer):
        raise HTTPException(
            status_code=404, detail="Esa persona no está en tu equipo directo"
        )
    objetivo = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not objetivo:
        raise HTTPException(status_code=404, detail="Persona no encontrada")
    return listar_mi_equipo_efectivo(db, objetivo)


def agregar_a_mi_equipo(db: Session, usuario: Usuario, usuario_id: int, rol: RolEnum) -> EquipoMiembro:
    """Agrega (o reasigna el rol de) una persona en la plantilla personal de
    `usuario` — extraído del router para que el asistente de voz pueda
    reutilizarlo igual que cualquier otra tool (ver agregar_a_mi_equipo en
    app/services/asistente/tools.py). El caller hace db.commit()/refresh."""
    if usuario_id == usuario.id:
        raise HTTPException(
            status_code=400, detail="No puedes agregarte a ti mismo a tu propio equipo"
        )

    existente = (
        db.query(EquipoMiembro)
        .filter(EquipoMiembro.propietario_id == usuario.id, EquipoMiembro.usuario_id == usuario_id)
        .first()
    )
    if existente:
        existente.rol = rol
        return existente

    registro = EquipoMiembro(propietario_id=usuario.id, usuario_id=usuario_id, rol=rol)
    db.add(registro)
    return registro


def crear_persona_y_agregar_a_mi_equipo(
    db: Session, usuario: Usuario, nombre: str, puesto: Optional[str], email: str, rol: RolEnum
) -> EquipoMiembro:
    """Da de alta una cuenta nueva y la agrega de una vez a la plantilla
    personal de `usuario` -- decisión de Yue (2026-08-17): un Líder (N2) no
    debe tener que pedirle a un N1 que dé de alta a alguien que quiere sumar
    a su equipo. Restringido a Colaborador/Externo (N3/N4): dar de alta a
    otro N1/N2 sigue siendo exclusivo de Dirección vía POST /usuarios (ver
    app/routers/usuarios.py)."""
    if rol not in (RolEnum.N3, RolEnum.N4):
        raise HTTPException(
            status_code=400,
            detail="Solo puedes dar de alta a alguien nuevo como colaborador interno o externo",
        )
    if db.query(Usuario).filter(Usuario.email == email).first():
        raise HTTPException(status_code=400, detail="Ese email ya está registrado")

    nuevo = Usuario(
        nombre=nombre,
        puesto=puesto,
        email=email,
        password_hash=hash_password(PASSWORD_DEFECTO_PERSONA_NUEVA),
    )
    db.add(nuevo)
    db.flush()  # asigna nuevo.id sin cerrar la transacción del caller

    return agregar_a_mi_equipo(db, usuario, nuevo.id, rol)


def quitar_de_mi_equipo(db: Session, usuario: Usuario, usuario_id: int) -> None:
    """Contraparte de agregar_a_mi_equipo — extraída del router por el mismo
    motivo. El caller hace db.commit()."""
    registro = (
        db.query(EquipoMiembro)
        .filter(EquipoMiembro.propietario_id == usuario.id, EquipoMiembro.usuario_id == usuario_id)
        .first()
    )
    if not registro:
        raise HTTPException(status_code=404, detail="Ese usuario no está en tu equipo guardado")
    db.delete(registro)


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

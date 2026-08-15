"""
Script de alta de los proyectos reales que David lidera hoy: Cubo, Suit y
Agenda Inteligente, con sus roles, la reunión y el entregable acordados con
Yue para el 19 de agosto de 2026 (ver CLAUDE.md).

Pensado para correr DESPUÉS de limpiar_datos_proyectos.py, sobre una base
que ya tiene de alta a los 7 usuarios reales (seed_usuarios_reales.py) — no
crea usuarios, solo los busca por email y falla claro si alguno no existe.

Uso:
    python cargar_proyectos_reales.py             # dry-run: describe qué se crearía
    python cargar_proyectos_reales.py --ejecutar   # crea de verdad

Idempotente: si un proyecto/rol/la reunión/el entregable ya existen (mismo
nombre, mismo usuario+proyecto, misma reunión/entregable), no los duplica —
seguro de correr más de una vez.
"""
import sys
from datetime import datetime

from app.database import Base, SessionLocal, engine
from app.models.entregable import Entregable
from app.models.proyecto import Proyecto
from app.models.reunion import Reunion, ReunionParticipante
from app.models.usuario import RolEnum, Usuario
from app.models.usuario_proyecto_rol import UsuarioProyectoRol

Base.metadata.create_all(bind=engine)

EMAILS = {
    "bernardo": "bperezs@gruposalinas.com",
    "david": "david.mancilla@gen24.mx",
    "ana": "ana.garcia@presidencia.gob.mx",
    "ivan": "Ivan.mora@dialogus.com.mx",
    "juan_jose": "juan.flores@elektra.com.mx",
    "jasso": "jose.jimenez@gen24.mx",
    "diana": "dchalini@gen24.mx",
}

PROYECTOS = [
    {"nombre": "Cubo", "descripcion": None, "n3": "ana"},
    {"nombre": "Suit", "descripcion": None, "n3": "ivan"},
    {"nombre": "Agenda Inteligente", "descripcion": None, "n3": "juan_jose"},
]

REUNION = {
    "proyecto": "Agenda Inteligente",
    "titulo": "Revisión de avance — Agenda Inteligente",
    "fecha_inicio": datetime(2026, 8, 19, 11, 0),
    "duracion_minutos": 60,
    "organizador": "david",
    "participantes": ["bernardo", "jasso", "diana", "juan_jose"],
}

ENTREGABLE = {
    "proyecto": "Agenda Inteligente",
    "nombre": "Avance de la agenda",
    "descripcion": "Avance a presentar en la reunión del 19 de agosto de 2026, 11:00-12:00.",
    "responsable": "juan_jose",
    "creado_por": "david",
    "fecha_entrega": datetime(2026, 8, 19).date(),
}


def _resolver_usuarios(db):
    usuarios = {}
    faltantes = []
    for clave, email in EMAILS.items():
        u = db.query(Usuario).filter(Usuario.email == email).first()
        if u is None:
            faltantes.append(f"{clave} ({email})")
        else:
            usuarios[clave] = u
    if faltantes:
        print("No se encontraron estos usuarios (¿ya se corrió seed_usuarios_reales.py?):")
        for f in faltantes:
            print(f"  - {f}")
        sys.exit(1)
    return usuarios


def _plan(usuarios):
    lineas = []
    for p in PROYECTOS:
        lineas.append(f'Proyecto "{p["nombre"]}":')
        for clave, rol in (("bernardo", "N1"), ("david", "N2"), (p["n3"], "N3")):
            u = usuarios[clave]
            lineas.append(f"  {rol}: {u.nombre} ({u.email})")

    lineas.append(f'Proyecto "{REUNION["proyecto"]}" también suma rol N4 a:')
    for clave in ("jasso", "diana"):
        u = usuarios[clave]
        lineas.append(f"  N4: {u.nombre} ({u.email})")

    organizador = usuarios[REUNION["organizador"]]
    participantes = ", ".join(usuarios[c].nombre for c in REUNION["participantes"])
    lineas.append(
        f'\nReunión "{REUNION["titulo"]}" el {REUNION["fecha_inicio"]:%Y-%m-%d %H:%M} '
        f'({REUNION["duracion_minutos"]} min) en "{REUNION["proyecto"]}"\n'
        f"  organiza: {organizador.nombre}\n"
        f"  participantes: {participantes}"
    )

    responsable = usuarios[ENTREGABLE["responsable"]]
    lineas.append(
        f'\nEntregable "{ENTREGABLE["nombre"]}" en "{ENTREGABLE["proyecto"]}"\n'
        f"  responsable: {responsable.nombre}\n"
        f"  fecha límite: {ENTREGABLE['fecha_entrega']}\n"
        f"  descripción: {ENTREGABLE['descripcion']}"
    )
    return lineas


def _crear_proyecto_si_falta(db, nombre, descripcion):
    existente = db.query(Proyecto).filter(Proyecto.nombre == nombre).first()
    if existente:
        return existente
    p = Proyecto(nombre=nombre, descripcion=descripcion)
    db.add(p)
    db.flush()
    return p


def _asignar_rol_si_falta(db, usuario, proyecto, rol, supervisor_id=None):
    existente = (
        db.query(UsuarioProyectoRol)
        .filter(
            UsuarioProyectoRol.usuario_id == usuario.id,
            UsuarioProyectoRol.proyecto_id == proyecto.id,
        )
        .first()
    )
    if existente:
        existente.rol = rol
        existente.supervisor_id = supervisor_id
        return existente
    nuevo = UsuarioProyectoRol(
        usuario_id=usuario.id, proyecto_id=proyecto.id, rol=rol, supervisor_id=supervisor_id
    )
    db.add(nuevo)
    return nuevo


def _ejecutar(db, usuarios):
    proyectos = {}
    for p in PROYECTOS:
        proyecto = _crear_proyecto_si_falta(db, p["nombre"], p["descripcion"])
        proyectos[p["nombre"]] = proyecto
        _asignar_rol_si_falta(db, usuarios["bernardo"], proyecto, RolEnum.N1)
        _asignar_rol_si_falta(db, usuarios["david"], proyecto, RolEnum.N2)
        _asignar_rol_si_falta(
            db, usuarios[p["n3"]], proyecto, RolEnum.N3, supervisor_id=usuarios["david"].id
        )

    agenda = proyectos["Agenda Inteligente"]
    _asignar_rol_si_falta(
        db, usuarios["jasso"], agenda, RolEnum.N4, supervisor_id=usuarios["david"].id
    )
    _asignar_rol_si_falta(
        db, usuarios["diana"], agenda, RolEnum.N4, supervisor_id=usuarios["david"].id
    )
    db.flush()

    organizador = usuarios[REUNION["organizador"]]
    reunion = (
        db.query(Reunion)
        .filter(
            Reunion.proyecto_id == agenda.id,
            Reunion.titulo == REUNION["titulo"],
            Reunion.fecha_inicio == REUNION["fecha_inicio"],
        )
        .first()
    )
    if reunion is None:
        reunion = Reunion(
            proyecto_id=agenda.id,
            titulo=REUNION["titulo"],
            fecha_inicio=REUNION["fecha_inicio"],
            duracion_minutos=REUNION["duracion_minutos"],
            organizador_id=organizador.id,
        )
        db.add(reunion)
        db.flush()
        for clave in REUNION["participantes"]:
            db.add(ReunionParticipante(reunion_id=reunion.id, usuario_id=usuarios[clave].id))

    entregable = (
        db.query(Entregable)
        .filter(Entregable.proyecto_id == agenda.id, Entregable.nombre == ENTREGABLE["nombre"])
        .first()
    )
    if entregable is None:
        db.add(
            Entregable(
                proyecto_id=agenda.id,
                nombre=ENTREGABLE["nombre"],
                descripcion=ENTREGABLE["descripcion"],
                responsable_id=usuarios[ENTREGABLE["responsable"]].id,
                fecha_entrega=ENTREGABLE["fecha_entrega"],
                creado_por=usuarios[ENTREGABLE["creado_por"]].id,
            )
        )


def main():
    ejecutar = "--ejecutar" in sys.argv[1:]
    db = SessionLocal()
    try:
        usuarios = _resolver_usuarios(db)

        if not ejecutar:
            print("Dry-run — esto se crearía (nada se guarda todavía):\n")
            print("\n".join(_plan(usuarios)))
            print("\nCorre con --ejecutar para aplicar de verdad.")
            return

        _ejecutar(db, usuarios)
        db.commit()
        print("Listo — proyectos, roles, reunión y entregable creados.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()

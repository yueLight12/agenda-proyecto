"""
Script de alta de los proyectos reales que Diana lidera hoy: Despachos, Casa
(personales y oficinas), Suits, OCESA/Socio plus, RED y Centro comunitario
(ver CLAUDE.md).

Pensado para correr sobre una base que ya tiene de alta a Bernardo y Diana
(seed_usuarios_reales.py) — no crea usuarios, solo los busca por email y
falla claro si alguno no existe. Mismo patrón que cargar_proyectos_reales.py
(los proyectos de David), solo que aquí no hay reunión ni entregable, y
Diana queda como única líder (N2), sin nadie más asignado todavía.

Uso:
    python cargar_proyectos_diana.py             # dry-run: describe qué se crearía
    python cargar_proyectos_diana.py --ejecutar   # crea de verdad

Idempotente: si un proyecto/rol ya existe (mismo nombre, mismo usuario+proyecto),
no los duplica — seguro de correr más de una vez.
"""
import sys

from app.database import Base, SessionLocal, engine
from app.models.proyecto import Proyecto
from app.models.usuario import RolEnum, Usuario
from app.models.usuario_proyecto_rol import UsuarioProyectoRol

Base.metadata.create_all(bind=engine)

EMAILS = {
    "bernardo": "bperezs@gruposalinas.com",
    "diana": "dchalini@gen24.mx",
}

PROYECTOS = [
    "Despachos",
    "Casa, personales y oficinas",
    "Suits",
    "OCESA/Socio plus",
    "RED",
    "Centro comunitario",
]


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
    for nombre in PROYECTOS:
        lineas.append(f'Proyecto "{nombre}":')
        lineas.append(f"  N1: {usuarios['bernardo'].nombre} ({usuarios['bernardo'].email})")
        lineas.append(f"  N2: {usuarios['diana'].nombre} ({usuarios['diana'].email})")
    return lineas


def _crear_proyecto_si_falta(db, nombre):
    existente = db.query(Proyecto).filter(Proyecto.nombre == nombre).first()
    if existente:
        return existente
    p = Proyecto(nombre=nombre, descripcion=None)
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
    for nombre in PROYECTOS:
        proyecto = _crear_proyecto_si_falta(db, nombre)
        _asignar_rol_si_falta(db, usuarios["bernardo"], proyecto, RolEnum.N1)
        _asignar_rol_si_falta(db, usuarios["diana"], proyecto, RolEnum.N2)
    db.flush()


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
        print("Listo — proyectos y roles creados.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()

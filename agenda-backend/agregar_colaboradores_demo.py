"""
Script de datos de DEMO: agrega 4 usuarios de prueba (Colaborador A/B/C/D)
como N3 en el proyecto "Agenda Inteligente", supervisados por Jasso (A, B)
y por Diana (C, D) — solo para que Yue pueda visualizar cómo se ve "Tu
equipo" del Dashboard con 3 columnas Kanban (una por cada N2 conceptual:
David, Jasso, Diana) en vez de solo una.

No requiere ningún cambio de código: KanbanSupervisores.jsx ya renderiza
una columna por cada supervisor_id distinto que encuentra — con David ya
apareciendo hoy, agregar gente supervisada por Jasso/Diana basta para que
salgan sus columnas también.

Los 4 usuarios usan el dominio @demo.local a propósito, para que sea
imposible confundirlos con correos reales del cliente y sea fácil
identificarlos/borrarlos después (ver sección "cómo quitarlos" abajo).

Uso:
    python agregar_colaboradores_demo.py             # dry-run: describe qué se crearía
    python agregar_colaboradores_demo.py --ejecutar   # crea de verdad

Idempotente: si un usuario/rol ya existe, no lo duplica.

Cómo quitarlos cuando ya no se necesiten para la demo (a mano, por SQL):
    DELETE FROM usuario_proyecto_rol WHERE usuario_id IN (
        SELECT id FROM usuarios WHERE email LIKE '%@demo.local'
    );
    DELETE FROM usuarios WHERE email LIKE '%@demo.local';
"""
import sys

from app.core.security import hash_password
from app.database import Base, SessionLocal, engine
from app.models.proyecto import Proyecto
from app.models.usuario import RolEnum, Usuario
from app.models.usuario_proyecto_rol import UsuarioProyectoRol

Base.metadata.create_all(bind=engine)

PASSWORD_DEMO = "Demo1234!"
PROYECTO_NOMBRE = "Agenda Inteligente"

COLABORADORES = [
    ("Colaborador A", "colaborador.a@demo.local", "jose.jimenez@gen24.mx"),
    ("Colaborador B", "colaborador.b@demo.local", "jose.jimenez@gen24.mx"),
    ("Colaborador C", "colaborador.c@demo.local", "dchalini@gen24.mx"),
    ("Colaborador D", "colaborador.d@demo.local", "dchalini@gen24.mx"),
]


def _resolver_supervisores(db):
    emails = {email for _, _, email in COLABORADORES}
    usuarios = {u.email: u for u in db.query(Usuario).filter(Usuario.email.in_(emails)).all()}
    faltantes = emails - usuarios.keys()
    if faltantes:
        print("No se encontraron estos supervisores (¿siguen con el mismo email?):")
        for f in faltantes:
            print(f"  - {f}")
        sys.exit(1)
    return usuarios


def _plan(db, proyecto, supervisores):
    lineas = [f'Proyecto: "{proyecto.nombre}" (id={proyecto.id})']
    for nombre, email, email_supervisor in COLABORADORES:
        supervisor = supervisores[email_supervisor]
        existente = db.query(Usuario).filter(Usuario.email == email).first()
        estado = "ya existe" if existente else "se crea"
        lineas.append(f"  {nombre} ({email}) — {estado} — N3, supervisor: {supervisor.nombre}")
    return lineas


def _ejecutar(db, proyecto, supervisores):
    for nombre, email, email_supervisor in COLABORADORES:
        supervisor = supervisores[email_supervisor]
        usuario = db.query(Usuario).filter(Usuario.email == email).first()
        if usuario is None:
            usuario = Usuario(nombre=nombre, email=email, password_hash=hash_password(PASSWORD_DEMO))
            db.add(usuario)
            db.flush()

        existente_rol = (
            db.query(UsuarioProyectoRol)
            .filter(
                UsuarioProyectoRol.usuario_id == usuario.id,
                UsuarioProyectoRol.proyecto_id == proyecto.id,
            )
            .first()
        )
        if existente_rol:
            existente_rol.rol = RolEnum.N3
            existente_rol.supervisor_id = supervisor.id
        else:
            db.add(
                UsuarioProyectoRol(
                    usuario_id=usuario.id,
                    proyecto_id=proyecto.id,
                    rol=RolEnum.N3,
                    supervisor_id=supervisor.id,
                )
            )


def main():
    ejecutar = "--ejecutar" in sys.argv[1:]
    db = SessionLocal()
    try:
        proyecto = db.query(Proyecto).filter(Proyecto.nombre == PROYECTO_NOMBRE).first()
        if proyecto is None:
            print(f'No se encontró el proyecto "{PROYECTO_NOMBRE}".')
            sys.exit(1)

        supervisores = _resolver_supervisores(db)

        if not ejecutar:
            print("Dry-run — esto se crearía (nada se guarda todavía):\n")
            print("\n".join(_plan(db, proyecto, supervisores)))
            print("\nCorre con --ejecutar para aplicar de verdad.")
            return

        _ejecutar(db, proyecto, supervisores)
        db.commit()
        print("Listo — 4 colaboradores de demo creados/actualizados.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()

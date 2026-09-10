"""
Script de datos de DEMO: crea un proyecto "Demo Pública" aislado y un
usuario demo (N2, dueño de ese proyecto) para mostrar el sistema en vivo
(ej. QR en una presentación) sin que lo que la gente haga afecte ningún
proyecto ni usuario real.

Aislamiento: gracias a app/core/permissions.py (requerir_participacion_en_
proyecto), un usuario SIN fila en usuario_proyecto_rol para un proyecto (ni
para ninguno de sus ancestros) recibe 403 al intentar verlo o tocarlo. Este
usuario demo:
  - NO es super_admin (el super_admin ve/administra todo, rompería el
    aislamiento).
  - Solo tiene una fila UsuarioProyectoRol: la de "Demo Pública" (proyecto
    raíz, sin padre, creado por este script).
Con eso, no puede ver ni editar ningún proyecto real, aunque cree/edite
libremente tareas y juntas dentro de "Demo Pública".

Uso:
    python crear_usuario_demo_publico.py             # dry-run
    python crear_usuario_demo_publico.py --ejecutar   # crea de verdad

Idempotente: si el usuario/proyecto/rol ya existen, no los duplica.

Cómo quitarlo cuando ya no se necesite (a mano, por SQL):
    DELETE FROM usuario_proyecto_rol WHERE usuario_id IN (
        SELECT id FROM usuarios WHERE email = 'demo@demopublico.mx'
    );
    DELETE FROM usuarios WHERE email = 'demo@demopublico.mx';
    DELETE FROM proyectos WHERE nombre = 'Demo Pública';
"""
import sys

from app.core.security import hash_password
from app.database import Base, SessionLocal, engine
from app.models.proyecto import Proyecto
from app.models.usuario import RolEnum, Usuario
from app.models.usuario_proyecto_rol import UsuarioProyectoRol

Base.metadata.create_all(bind=engine)

PASSWORD_DEMO = "Demo1234!"
PROYECTO_NOMBRE = "Demo Pública"
USUARIO_NOMBRE = "Usuario Demo"
# OJO: nunca usar un TLD reservado (.local, .example, .test, .invalid) --
# email-validator lo rechaza al serializar GET /usuarios y tumba el
# endpoint COMPLETO con 500, no solo el registro de este usuario (bug real
# encontrado 2026-09-10 con demo@demo.local).
USUARIO_EMAIL = "demo@demopublico.mx"


def _plan(db):
    proyecto = db.query(Proyecto).filter(Proyecto.nombre == PROYECTO_NOMBRE).first()
    usuario = db.query(Usuario).filter(Usuario.email == USUARIO_EMAIL).first()
    lineas = [
        f'Proyecto "{PROYECTO_NOMBRE}" — {"ya existe" if proyecto else "se crea"}',
        f"Usuario {USUARIO_NOMBRE} ({USUARIO_EMAIL}) — {'ya existe' if usuario else 'se crea'} — N2",
        f"Contraseña: {PASSWORD_DEMO}",
    ]
    return lineas


def _ejecutar(db):
    proyecto = db.query(Proyecto).filter(Proyecto.nombre == PROYECTO_NOMBRE).first()
    if proyecto is None:
        proyecto = Proyecto(nombre=PROYECTO_NOMBRE, descripcion="Proyecto aislado para demostraciones en vivo.")
        db.add(proyecto)
        db.flush()

    usuario = db.query(Usuario).filter(Usuario.email == USUARIO_EMAIL).first()
    if usuario is None:
        usuario = Usuario(
            nombre=USUARIO_NOMBRE,
            email=USUARIO_EMAIL,
            password_hash=hash_password(PASSWORD_DEMO),
        )
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
    if existente_rol is None:
        db.add(
            UsuarioProyectoRol(
                usuario_id=usuario.id,
                proyecto_id=proyecto.id,
                rol=RolEnum.N2,
            )
        )


def main():
    ejecutar = "--ejecutar" in sys.argv[1:]
    db = SessionLocal()
    try:
        if not ejecutar:
            print("Dry-run — esto se crearía (nada se guarda todavía):\n")
            print("\n".join(_plan(db)))
            print("\nCorre con --ejecutar para aplicar de verdad.")
            return

        _ejecutar(db)
        db.commit()
        print("Listo.")
        print(f"  Email: {USUARIO_EMAIL}")
        print(f"  Contraseña: {PASSWORD_DEMO}")
        print(f'  Proyecto aislado: "{PROYECTO_NOMBRE}"')
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()

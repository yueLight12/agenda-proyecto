"""
Script de alta de usuarios reales (equipo de Presidencia).

No crea proyectos ni asignaciones de rol: cada quien puede crear su propio
proyecto desde la app (queda como N1 automáticamente) e ir agregando al
resto del equipo con el rol que corresponda en cada caso.

Uso:
    python seed_usuarios_reales.py

Nota: es idempotente (si el email ya existe, no lo vuelve a crear ni le
cambia la contraseña) — seguro de correr más de una vez.
"""
import secrets
import string

from app.core.security import hash_password
from app.database import Base, SessionLocal, engine
from app.models.usuario import Usuario

Base.metadata.create_all(bind=engine)

db = SessionLocal()


def generar_password_temporal() -> str:
    alfabeto = string.ascii_letters + string.digits
    return "".join(secrets.choice(alfabeto) for _ in range(10)) + "!"


usuarios_data = [
    ("Bernardo Perez Suarez", "Director Administración de Administración Presidencia", "bernardo.perez@presidencia.gob.mx"),
    ("David Mancilla Walles", "Gerente de Información Ejecutiva e Innovación Digital", "david.mancilla@presidencia.gob.mx"),
    ("Diana Elizabeth Chalini Robles", "Gerente de Administración Casas", "diana.chalini@presidencia.gob.mx"),
    ("Jose Francisco Jimenez Jasso", "Director Administración y Finanzas de Administración Presidencia", "josefrancisco.jimenez@presidencia.gob.mx"),
    ("Ivan Mora Garcia", "Consultor de Sistemas", "ivan.mora@presidencia.gob.mx"),
    ("Juan Jose Flores Sedano", "Consultor Sistemas", "juanjose.flores@presidencia.gob.mx"),
    ("Ana Guadalupe Garcia Avila", "Consultora Información Ejecutiva Presidencia", "ana.garcia@presidencia.gob.mx"),
]

resultados = []
for nombre, puesto, email in usuarios_data:
    existente = db.query(Usuario).filter(Usuario.email == email).first()
    if existente:
        resultados.append((nombre, email, "(ya existía, no se modificó)"))
        continue
    password_temporal = generar_password_temporal()
    nuevo = Usuario(
        nombre=nombre,
        puesto=puesto,
        email=email,
        password_hash=hash_password(password_temporal),
    )
    db.add(nuevo)
    resultados.append((nombre, email, password_temporal))

db.commit()
db.close()

print("Usuarios reales listos:\n")
for nombre, email, password in resultados:
    print(f"  {nombre}\n    email: {email}\n    password temporal: {password}\n")

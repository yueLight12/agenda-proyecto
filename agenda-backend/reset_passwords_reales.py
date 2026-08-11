"""
Script de reseteo de contraseñas para el equipo real (Presidencia).

Genera una contraseña temporal nueva para cada email de la lista y actualiza
su password_hash en la base. Guarda la salida en credenciales_reseteo.txt
(NO se sube a git, ver .gitignore) para no perderla como pasó con
seed_usuarios_reales.py.

Uso:
    python reset_passwords_reales.py
"""
import secrets
import string
from datetime import datetime

from app.core.security import hash_password
from app.database import SessionLocal
from app.models.usuario import Usuario

db = SessionLocal()


def generar_password_temporal() -> str:
    alfabeto = string.ascii_letters + string.digits
    return "".join(secrets.choice(alfabeto) for _ in range(10)) + "!"


emails = [
    "bernardo.perez@presidencia.gob.mx",
    "david.mancilla@presidencia.gob.mx",
    "diana.chalini@presidencia.gob.mx",
    "josefrancisco.jimenez@presidencia.gob.mx",
    "ivan.mora@presidencia.gob.mx",
    "juanjose.flores@presidencia.gob.mx",
    "ana.garcia@presidencia.gob.mx",
]

resultados = []
for email in emails:
    usuario = db.query(Usuario).filter(Usuario.email == email).first()
    if not usuario:
        resultados.append((email, None, "(no existe, se omitió)"))
        continue
    password_temporal = generar_password_temporal()
    usuario.password_hash = hash_password(password_temporal)
    resultados.append((usuario.nombre, email, password_temporal))

db.commit()
db.close()

lineas = [f"Contraseñas generadas el {datetime.now().isoformat(timespec='seconds')}\n"]
for nombre, email, password in resultados:
    lineas.append(f"{nombre}\n  email: {email}\n  password temporal: {password}\n")

salida = "\n".join(lineas)
print(salida)

with open("credenciales_reseteo.txt", "w", encoding="utf-8") as f:
    f.write(salida)

print("\nGuardado también en credenciales_reseteo.txt")

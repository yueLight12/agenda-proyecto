"""
Script de reseteo de contraseñas para el equipo real (Presidencia).

Regresa la contraseña de cada email de la lista a PASSWORD_DEFECTO (misma
que usan las cuentas demo) y actualiza su password_hash en la base — útil
si alguien cambió su contraseña y la olvidó, para dejarlo de vuelta en el
default y que la vuelva a cambiar desde "Cambiar contraseña" en la app.
Guarda la salida en credenciales_reseteo.txt (NO se sube a git, ver
.gitignore) como registro de cuándo se reseteó a quién.

Uso:
    python reset_passwords_reales.py
"""
from datetime import datetime

from app.core.security import hash_password
from app.database import SessionLocal
from app.models.usuario import Usuario

db = SessionLocal()

PASSWORD_DEFECTO = "Demo1234!"

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
    usuario.password_hash = hash_password(PASSWORD_DEFECTO)
    resultados.append((usuario.nombre, email, PASSWORD_DEFECTO))

db.commit()
db.close()

lineas = [f"Contraseñas reseteadas el {datetime.now().isoformat(timespec='seconds')}\n"]
for nombre, email, password in resultados:
    lineas.append(f"{nombre}\n  email: {email}\n  password: {password}\n")

salida = "\n".join(lineas)
print(salida)

with open("credenciales_reseteo.txt", "w", encoding="utf-8") as f:
    f.write(salida)

print("\nGuardado también en credenciales_reseteo.txt")

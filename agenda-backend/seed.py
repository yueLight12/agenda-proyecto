"""
Script de datos de prueba: 1 N1, 2 N2, 3 N3, 1 N4, y 4 proyectos.

Uso:
    python seed.py

Nota: es idempotente-parcial (no falla si usuarios ya existen), pero está
pensado para correrse una sola vez sobre una base de datos limpia.
"""
from app.core.security import hash_password
from app.database import Base, SessionLocal, engine
from app.models.proyecto import Proyecto
from app.models.usuario import RolEnum, Usuario
from app.models.usuario_proyecto_rol import UsuarioProyectoRol

Base.metadata.create_all(bind=engine)

db = SessionLocal()

PASSWORD_DEMO = "Demo1234!"

usuarios_data = [
    ("Dirección Uno", "n1@demo.com"),
    ("Lider Proyecto A", "n1@demo.com"),
    ("Lider Proyecto B", "n2b@demo.com"),
    ("Colaborador Uno", "n3a@demo.com"),
    ("Colaborador Dos", "n3b@demo.com"),
    ("Colaborador Tres", "n3c@demo.com"),
    ("Colaborador Externo", "n4a@demo.com"),
]

usuarios = {}
for nombre, email in usuarios_data:
    existente = db.query(Usuario).filter(Usuario.email == email).first()
    if existente:
        usuarios[email] = existente
        continue
    u = Usuario(nombre=nombre, email=email, password_hash=hash_password(PASSWORD_DEMO))
    db.add(u)
    db.flush()
    usuarios[email] = u

db.commit()

proyectos_data = [
    ("Proyecto Alfa", "Proyecto de prueba 1"),
    ("Proyecto Beta", "Proyecto de prueba 2"),
    ("Proyecto Gamma", "Proyecto de prueba 3"),
    ("Proyecto Delta", "Proyecto de prueba 4"),
]

proyectos = []
for nombre, descripcion in proyectos_data:
    existente = db.query(Proyecto).filter(Proyecto.nombre == nombre).first()
    if existente:
        proyectos.append(existente)
        continue
    p = Proyecto(nombre=nombre, descripcion=descripcion)
    db.add(p)
    db.flush()
    proyectos.append(p)

db.commit()

n1 = usuarios["n1@demo.com"]
n2a = usuarios["n2a@demo.com"]
n2b = usuarios["n2b@demo.com"]
n3a = usuarios["n3a@demo.com"]
n3b = usuarios["n3b@demo.com"]
n3c = usuarios["n3c@demo.com"]
n4a = usuarios["n4a@demo.com"]

# Asignación de roles por proyecto (ejemplo de distribución para probar el flujo)
asignaciones = [
    # Proyecto Alfa: N1 ve todo, N2a lidera con n3a y n3b, n4a colabora externo con n2a
    (proyectos[0], n1, RolEnum.N1, None),
    (proyectos[0], n2a, RolEnum.N2, None),
    (proyectos[0], n3a, RolEnum.N3, n2a.id),
    (proyectos[0], n3b, RolEnum.N3, n2a.id),
    (proyectos[0], n4a, RolEnum.N4, n2a.id),
    # Proyecto Beta: N2b lidera con n3c
    (proyectos[1], n1, RolEnum.N1, None),
    (proyectos[1], n2b, RolEnum.N2, None),
    (proyectos[1], n3c, RolEnum.N3, n2b.id),
    # Proyecto Gamma: N2a y N2b ambos, cada uno con su gente
    (proyectos[2], n1, RolEnum.N1, None),
    (proyectos[2], n2a, RolEnum.N2, None),
    (proyectos[2], n2b, RolEnum.N2, None),
    (proyectos[2], n3a, RolEnum.N3, n2a.id),
    (proyectos[2], n3c, RolEnum.N3, n2b.id),
    # Proyecto Delta: solo N1 y N2a con n3b
    (proyectos[3], n1, RolEnum.N1, None),
    (proyectos[3], n2a, RolEnum.N2, None),
    (proyectos[3], n3b, RolEnum.N3, n2a.id),
]

for proyecto, usuario, rol, supervisor_id in asignaciones:
    existente = (
        db.query(UsuarioProyectoRol)
        .filter(
            UsuarioProyectoRol.usuario_id == usuario.id,
            UsuarioProyectoRol.proyecto_id == proyecto.id,
        )
        .first()
    )
    if existente:
        continue
    db.add(
        UsuarioProyectoRol(
            usuario_id=usuario.id,
            proyecto_id=proyecto.id,
            rol=rol,
            supervisor_id=supervisor_id,
        )
    )

db.commit()
db.close()

print("Datos de prueba creados correctamente.")
print(f"Password para todos los usuarios de prueba: {PASSWORD_DEMO}")
for _, email in usuarios_data:
    print(f"  - {email}")

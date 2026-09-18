"""
Siembra usuarios/proyectos de PRUEBA que simulan una jerarquía N1/N2/N3/N4
completa, para probar cosas (como el cambio de _companeros_de_jefes en
reuniones.py) sin arriesgar la base de datos real -- ver CLAUDE.md, "local y
devtunnel comparten una sola base de datos".

USO: correr con DATABASE_URL apuntando a la base de PRUEBAS (agenda_pruebas),
NUNCA a agenda_nueva:

    $env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5442/agenda_pruebas"
    .\\.venv\\Scripts\\python.exe scripts_pruebas\\seed_jerarquia_prueba.py

Idempotente: si ya corrió antes, borra y recrea las filas de prueba (por
email, todos bajo el dominio "prueba.local") en vez de duplicar.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

assert "agenda_pruebas" in os.environ.get("DATABASE_URL", ""), (
    "DATABASE_URL no apunta a agenda_pruebas -- por seguridad este script "
    "se niega a correr contra cualquier otra base (ver CLAUDE.md sección 0, "
    "regla de no tocar la base real con datos de prueba)."
)

from app.core.security import hash_password
from app.database import SessionLocal
from app.models.proyecto import Proyecto
from app.models.usuario import RolEnum, Usuario
from app.models.usuario_proyecto_rol import UsuarioProyectoRol

CONTRASENA_PRUEBA = "prueba123"
# NUNCA ".local"/".test"/".invalid"/".example" -- el validador de correo de
# Pydantic (EmailStr, vía el paquete email-validator) los trata como
# dominios "de uso especial" reservados por RFC 6761 y los RECHAZA al
# armar la respuesta (bug real encontrado 2026-09-19: el login sí
# funcionaba, pero GET /auth/me tronaba 500 justo después -- el frontend
# lo mostraba como "No se pudo conectar con el servidor", muy engañoso).
DOMINIO = "prueba-agenda.mx"

db = SessionLocal()

# Limpieza (idempotente) -- borra cualquier corrida anterior de este script
# por dominio de correo, así se puede volver a correr sin duplicar.
usuarios_viejos = db.query(Usuario).filter(Usuario.email.like(f"%@{DOMINIO}")).all()
for u in usuarios_viejos:
    db.delete(u)
proyectos_viejos = db.query(Proyecto).filter(Proyecto.nombre.like("[PRUEBA]%")).all()
for p in proyectos_viejos:
    db.delete(p)
db.commit()


def crear_usuario(nombre: str, correo_local: str, puesto: str) -> Usuario:
    u = Usuario(
        nombre=nombre,
        puesto=puesto,
        email=f"{correo_local}@{DOMINIO}",
        password_hash=hash_password(CONTRASENA_PRUEBA),
        activo=True,
    )
    db.add(u)
    db.flush()
    return u


# --- Jerarquía --------------------------------------------------------
# Bernardo-equivalente: Dirección, N1 en AMBOS proyectos de prueba.
direccion = crear_usuario("Prueba Direccion", "direccion", "Dirección (prueba)")

# David-equivalente: Líder, N2 en AMBOS proyectos -- el mismo jefe
# "repetido" en dos temas distintos es justo el caso que antes no
# conectaba a sus N3 entre sí (ver _companeros_de_jefes).
lider = crear_usuario("Prueba Lider", "lider", "Líder de equipo (prueba)")

# Iván/Juan-equivalentes: colaboradores internos, cada uno en UN SOLO
# proyecto distinto, ambos supervisados por el mismo líder.
interno_a = crear_usuario("Prueba Interno A", "interno.a", "Colaborador interno (prueba)")
interno_b = crear_usuario("Prueba Interno B", "interno.b", "Colaborador interno (prueba)")

# Ana-equivalente: un tercer interno en el proyecto de Interno A, para
# probar 3+ compañeros bajo el mismo líder, no solo pares.
interno_c = crear_usuario("Prueba Interno C", "interno.c", "Colaborador interno (prueba)")

# Colaborador externo -- nunca debe aparecer como "compañero" de nadie
# (ver el límite explícito a N1/N2/N3 en _companeros_de_jefes).
externo = crear_usuario("Prueba Externo", "externo", "Colaborador externo (prueba)")

# --- Proyectos ---------------------------------------------------------
proyecto_alpha = Proyecto(nombre="[PRUEBA] Proyecto Alpha", descripcion="Tema de prueba -- jerarquía N1/N2/N3/N4")
proyecto_beta = Proyecto(nombre="[PRUEBA] Proyecto Beta", descripcion="Tema de prueba -- jerarquía N1/N2/N3/N4")
db.add_all([proyecto_alpha, proyecto_beta])
db.flush()

# Alpha: Dirección (N1), Líder (N2), Interno A + Interno C (N3, ambos
# supervisados por Líder), Externo (N4, supervisado por Líder).
db.add_all(
    [
        UsuarioProyectoRol(usuario_id=direccion.id, proyecto_id=proyecto_alpha.id, rol=RolEnum.N1),
        UsuarioProyectoRol(usuario_id=lider.id, proyecto_id=proyecto_alpha.id, rol=RolEnum.N2),
        UsuarioProyectoRol(
            usuario_id=interno_a.id, proyecto_id=proyecto_alpha.id, rol=RolEnum.N3, supervisor_id=lider.id
        ),
        UsuarioProyectoRol(
            usuario_id=interno_c.id, proyecto_id=proyecto_alpha.id, rol=RolEnum.N3, supervisor_id=lider.id
        ),
        UsuarioProyectoRol(
            usuario_id=externo.id, proyecto_id=proyecto_alpha.id, rol=RolEnum.N4, supervisor_id=lider.id
        ),
    ]
)

# Beta: Dirección (N1), Líder (N2, el MISMO de Alpha), Interno B (N3,
# supervisado por Líder) -- Interno B nunca comparte proyecto con
# Interno A/C, solo el mismo jefe (Líder) en un tema distinto.
db.add_all(
    [
        UsuarioProyectoRol(usuario_id=direccion.id, proyecto_id=proyecto_beta.id, rol=RolEnum.N1),
        UsuarioProyectoRol(usuario_id=lider.id, proyecto_id=proyecto_beta.id, rol=RolEnum.N2),
        UsuarioProyectoRol(
            usuario_id=interno_b.id, proyecto_id=proyecto_beta.id, rol=RolEnum.N3, supervisor_id=lider.id
        ),
    ]
)

db.commit()

print("Listo. Usuarios de prueba (contraseña para todos: 'prueba123'):")
for u in [direccion, lider, interno_a, interno_b, interno_c, externo]:
    print(f"  {u.email}  -- {u.nombre} ({u.puesto})")
print()
print("Proyectos: [PRUEBA] Proyecto Alpha (id", proyecto_alpha.id, "), [PRUEBA] Proyecto Beta (id", proyecto_beta.id, ")")
print()
print("Caso a probar: Interno A (proyecto Alpha) e Interno B (proyecto Beta)")
print("nunca comparten proyecto, pero ambos tienen a Lider como N2 -- deberían")
print("poder invitarse a una junta GENERAL entre sí tras el fix de reuniones.py.")

db.close()

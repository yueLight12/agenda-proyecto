"""
Migración manual de esquema (el proyecto no usa Alembic todavía -- mismo
patrón ya usado dos veces antes, ver CLAUDE.md: `Notificacion.evento_empresa_id`
y `Notificacion.reunion_id`, ambas agregadas con ALTER TABLE manual porque
`Base.metadata.create_all()` solo crea tablas nuevas, nunca columnas nuevas
en tablas ya existentes).

Dos cambios aditivos, ninguno con pérdida de datos ni backfill:
  1. `proyectos.parent_id` (nullable, FK a sí misma) -- generaliza Proyecto
     a un contenedor anidable a cualquier profundidad ("temas/subtemas").
     Todo proyecto existente queda con parent_id NULL (nodo raíz), sin
     ningún cambio de comportamiento.
  2. `reuniones.proyecto_id` pasa de NOT NULL a nullable -- habilita
     reuniones "generales" sin tema/proyecto (pendiente desde 2026-08-10,
     pedido explícitamente por el cliente el 2026-08-16).

Idempotente: revisa information_schema antes de alterar, se puede correr
más de una vez sin romper si ya se aplicó.

Uso (correr ANTES de desplegar el código nuevo, luego reiniciar `api`):
    python migrar_parent_id_proyectos.py
"""
from sqlalchemy import text

from app.database import engine


def _columna_existe(conn, tabla: str, columna: str) -> bool:
    fila = conn.execute(
        text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = :tabla AND column_name = :columna"
        ),
        {"tabla": tabla, "columna": columna},
    ).first()
    return fila is not None


def _columna_es_nullable(conn, tabla: str, columna: str) -> bool:
    fila = conn.execute(
        text(
            "SELECT is_nullable FROM information_schema.columns "
            "WHERE table_name = :tabla AND column_name = :columna"
        ),
        {"tabla": tabla, "columna": columna},
    ).first()
    return fila is not None and fila[0] == "YES"


def main():
    with engine.begin() as conn:
        if _columna_existe(conn, "proyectos", "parent_id"):
            print("proyectos.parent_id ya existe, se omite.")
        else:
            conn.execute(
                text(
                    "ALTER TABLE proyectos "
                    "ADD COLUMN parent_id INTEGER REFERENCES proyectos(id)"
                )
            )
            conn.execute(
                text("CREATE INDEX ix_proyectos_parent_id ON proyectos (parent_id)")
            )
            print("proyectos.parent_id agregada + índice creado.")

        if _columna_es_nullable(conn, "reuniones", "proyecto_id"):
            print("reuniones.proyecto_id ya es nullable, se omite.")
        else:
            conn.execute(
                text("ALTER TABLE reuniones ALTER COLUMN proyecto_id DROP NOT NULL")
            )
            print("reuniones.proyecto_id ahora es nullable (reuniones generales).")

    print("Migración completa.")


if __name__ == "__main__":
    main()

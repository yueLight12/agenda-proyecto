"""visto_bueno_entregables

Revision ID: 9b3f6a1c8e42
Revises: 7f2a9c5e1d34
Create Date: 2026-09-03 00:00:00.000000

"Visto bueno" de tareas completadas (aprobado por Yue el 2026-08-26,
construido el 2026-09-03) -- nuevo valor de enum "pendiente_aprobacion"
en estatusentregable, y columna avance_previo_aprobacion para poder
regresar al % anterior si se rechaza. Ver
app/services/entregables.py::aprobar_entregable/rechazar_entregable.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '9b3f6a1c8e42'
down_revision: Union[str, None] = '7f2a9c5e1d34'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ALTER TYPE ... ADD VALUE no se puede usar en la misma transacción en
    # la que luego se usa el valor nuevo -- aquí solo se agrega, no se usa
    # en este mismo upgrade(), así que corre bien dentro de la transacción
    # normal de Alembic en Postgres 12+.
    op.execute("ALTER TYPE estatusentregable ADD VALUE IF NOT EXISTS 'pendiente_aprobacion'")
    op.add_column(
        "entregables",
        sa.Column("avance_previo_aprobacion", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    # Postgres no soporta quitar un valor de un enum nativo directamente
    # (requeriría recrear el tipo y todas las columnas que lo usan) -- no
    # se implementa downgrade real para el valor del enum, solo se revierte
    # la columna.
    op.drop_column("entregables", "avance_previo_aprobacion")

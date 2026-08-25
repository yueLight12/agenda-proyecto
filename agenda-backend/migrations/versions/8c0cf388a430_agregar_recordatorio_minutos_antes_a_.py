"""agregar recordatorio_minutos_antes a reuniones y series, tipo notificacion recordatorio_reunion

Revision ID: 8c0cf388a430
Revises: 4500d682fc4c
Create Date: 2026-08-25 17:13:44.716067

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8c0cf388a430'
down_revision: Union[str, None] = '4500d682fc4c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('reuniones', sa.Column('recordatorio_minutos_antes', sa.Integer(), nullable=True))
    op.add_column('series_reunion', sa.Column('recordatorio_minutos_antes', sa.Integer(), nullable=True))
    # Autogenerate no compara valores de Enum ya existentes (ver CLAUDE.md) --
    # agregado a mano. ALTER TYPE ... ADD VALUE no puede correr dentro de un
    # bloque transaccional en versiones viejas de Postgres, pero Postgres 12+
    # sí lo permite dentro de una transacción normal (no antes del primer uso
    # en la misma transacción) -- alembic.ini ya usa transactional DDL aquí
    # sin problema en corridas previas de este mismo patrón.
    op.execute("ALTER TYPE tiponotificacion ADD VALUE IF NOT EXISTS 'recordatorio_reunion'")


def downgrade() -> None:
    # Postgres no soporta quitar un valor de un Enum -- no hay downgrade
    # limpio para el ALTER TYPE (mismo criterio ya aceptado en migraciones
    # previas de Enum en este repo). Las columnas sí se pueden revertir.
    op.drop_column('series_reunion', 'recordatorio_minutos_antes')
    op.drop_column('reuniones', 'recordatorio_minutos_antes')

"""pendientes_reutilizables

Revision ID: a1f47c92d3b6
Revises: e3d12e8d90ca
Create Date: 2026-08-17 00:00:00.000000

Agrega la tabla `pendientes` (texto reutilizable sobre un tema, ver
app/models/pendiente.py) y la columna `agenda_items.pendiente_id` para
poder "jalar" un pendiente ya escrito como punto del checklist de una
junta recurrente, en vez de retipearlo cada vez -- mismo espíritu que
`nota_id` (ver app/models/agenda_item.py).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a1f47c92d3b6'
down_revision: Union[str, None] = 'e3d12e8d90ca'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'pendientes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('proyecto_id', sa.Integer(), nullable=False),
        sa.Column('contenido', sa.String(length=500), nullable=False),
        sa.Column('autor_id', sa.Integer(), nullable=False),
        sa.Column('fecha_creacion', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['proyecto_id'], ['proyectos.id']),
        sa.ForeignKeyConstraint(['autor_id'], ['usuarios.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_pendientes_id'), 'pendientes', ['id'], unique=False)

    op.add_column('agenda_items', sa.Column('pendiente_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_agenda_items_pendiente_id_pendientes',
        'agenda_items',
        'pendientes',
        ['pendiente_id'],
        ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_agenda_items_pendiente_id_pendientes', 'agenda_items', type_='foreignkey')
    op.drop_column('agenda_items', 'pendiente_id')
    op.drop_index(op.f('ix_pendientes_id'), table_name='pendientes')
    op.drop_table('pendientes')

"""terminos_sensibles

Revision ID: 7e2f0c9a4d1b
Revises: d1a4e9c5b7f2
Create Date: 2026-09-15 17:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '7e2f0c9a4d1b'
down_revision: Union[str, None] = 'd1a4e9c5b7f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'terminos_sensibles',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('texto', sa.String(length=200), nullable=False),
        sa.Column('creado_por', sa.Integer(), nullable=False),
        sa.Column('fecha_creacion', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['creado_por'], ['usuarios.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('texto'),
    )
    op.create_index(op.f('ix_terminos_sensibles_id'), 'terminos_sensibles', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_terminos_sensibles_id'), table_name='terminos_sensibles')
    op.drop_table('terminos_sensibles')

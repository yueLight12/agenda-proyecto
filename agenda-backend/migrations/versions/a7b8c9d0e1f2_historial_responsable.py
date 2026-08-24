"""agrega historial_responsable (cadena de mando para visibilidad)

Revision ID: a7b8c9d0e1f2
Revises: f1a2b3c4d5e6
Create Date: 2026-08-23 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a7b8c9d0e1f2'
down_revision: Union[str, None] = 'f1a2b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'historial_responsable',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('entregable_id', sa.Integer(), nullable=False),
        sa.Column('usuario_id', sa.Integer(), nullable=False),
        sa.Column('fecha_desde', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['entregable_id'], ['entregables.id']),
        sa.ForeignKeyConstraint(['usuario_id'], ['usuarios.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        op.f('ix_historial_responsable_id'), 'historial_responsable', ['id'], unique=False
    )
    op.create_index(
        op.f('ix_historial_responsable_entregable_id'),
        'historial_responsable', ['entregable_id'], unique=False,
    )
    op.create_index(
        op.f('ix_historial_responsable_usuario_id'),
        'historial_responsable', ['usuario_id'], unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f('ix_historial_responsable_usuario_id'), table_name='historial_responsable')
    op.drop_index(op.f('ix_historial_responsable_entregable_id'), table_name='historial_responsable')
    op.drop_index(op.f('ix_historial_responsable_id'), table_name='historial_responsable')
    op.drop_table('historial_responsable')

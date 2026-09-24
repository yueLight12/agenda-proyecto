"""agrega tabla entregable_copiados

Revision ID: aff57c0b18e7
Revises: c87281163a42
Create Date: 2026-09-22 17:39:36.892730

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'aff57c0b18e7'
down_revision: Union[str, None] = 'c87281163a42'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Solo la tabla nueva -- el autogenerate detectó también drift ajeno
    # (índice de agenda_items, constraint de suscripciones_push) que no
    # tiene nada que ver con este cambio; viene de que la base LOCAL usada
    # para generar esto (agenda_pruebas) está ligeramente desalineada de
    # las migraciones reales -- se quitó a mano para no arrastrar ese DROP
    # a la base real.
    op.create_table('entregable_copiados',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('entregable_id', sa.Integer(), nullable=False),
    sa.Column('usuario_id', sa.Integer(), nullable=False),
    sa.Column('fecha_creacion', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['entregable_id'], ['entregables.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['usuario_id'], ['usuarios.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_entregable_copiados_id'), 'entregable_copiados', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_entregable_copiados_id'), table_name='entregable_copiados')
    op.drop_table('entregable_copiados')

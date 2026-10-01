"""tabla inicios_sesion

Revision ID: c6d7c66c8503
Revises: c001d1e5408b
Create Date: 2026-10-01 15:48:29.306461

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c6d7c66c8503'
down_revision: Union[str, None] = 'c001d1e5408b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # OJO (2026-10-01): el autogenerate también detectó el mismo drift no
    # relacionado de siempre (constraint único de suscripciones_push) --
    # se quitó a mano, no es parte de esta tarea (ver la migración
    # c001d1e5408b para el primer caso de este mismo drift).
    op.create_table('inicios_sesion',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('usuario_id', sa.Integer(), nullable=False),
    sa.Column('fecha', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['usuario_id'], ['usuarios.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_inicios_sesion_fecha'), 'inicios_sesion', ['fecha'], unique=False)
    op.create_index(op.f('ix_inicios_sesion_id'), 'inicios_sesion', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_inicios_sesion_id'), table_name='inicios_sesion')
    op.drop_index(op.f('ix_inicios_sesion_fecha'), table_name='inicios_sesion')
    op.drop_table('inicios_sesion')

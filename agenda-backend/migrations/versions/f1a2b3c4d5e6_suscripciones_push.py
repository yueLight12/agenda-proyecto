"""agrega suscripciones_push (Web Push VAPID)

Revision ID: f1a2b3c4d5e6
Revises: 9c7d4e1a5f2b
Create Date: 2026-08-23 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f1a2b3c4d5e6'
down_revision: Union[str, None] = '9c7d4e1a5f2b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'suscripciones_push',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('usuario_id', sa.Integer(), nullable=False),
        sa.Column('endpoint', sa.String(length=500), nullable=False),
        sa.Column('p256dh', sa.String(length=255), nullable=False),
        sa.Column('auth', sa.String(length=255), nullable=False),
        sa.Column('fecha_creacion', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['usuario_id'], ['usuarios.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('endpoint'),
    )
    op.create_index(
        op.f('ix_suscripciones_push_id'), 'suscripciones_push', ['id'], unique=False
    )
    op.create_index(
        op.f('ix_suscripciones_push_endpoint'), 'suscripciones_push', ['endpoint'], unique=True
    )


def downgrade() -> None:
    op.drop_index(op.f('ix_suscripciones_push_endpoint'), table_name='suscripciones_push')
    op.drop_index(op.f('ix_suscripciones_push_id'), table_name='suscripciones_push')
    op.drop_table('suscripciones_push')

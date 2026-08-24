"""agrega tabla correos_pendientes

Revision ID: c5d6e7f8a9b0
Revises: b3c4d5e6f7a8
Create Date: 2026-08-24 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c5d6e7f8a9b0'
down_revision: Union[str, None] = 'b3c4d5e6f7a8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'correos_pendientes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('destinatario_email', sa.String(length=255), nullable=False),
        sa.Column('asunto', sa.String(length=255), nullable=False),
        sa.Column('cuerpo_texto', sa.Text(), nullable=False),
        sa.Column('enviado', sa.Boolean(), nullable=False),
        sa.Column('fecha_creacion', sa.DateTime(), nullable=False),
        sa.Column('fecha_enviado', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_correos_pendientes_id'), 'correos_pendientes', ['id'], unique=False)
    op.create_index(op.f('ix_correos_pendientes_enviado'), 'correos_pendientes', ['enviado'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_correos_pendientes_enviado'), table_name='correos_pendientes')
    op.drop_index(op.f('ix_correos_pendientes_id'), table_name='correos_pendientes')
    op.drop_table('correos_pendientes')

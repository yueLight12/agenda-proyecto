"""tour_completado_preferencias

Revision ID: d1a4e9c5b7f2
Revises: ba423b186da3
Create Date: 2026-09-15 16:35:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'd1a4e9c5b7f2'
down_revision: Union[str, None] = 'ba423b186da3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'preferencias_usuario',
        sa.Column('tour_completado', sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column('preferencias_usuario', 'tour_completado')

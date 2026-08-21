"""fase2_3_ondelete_fks

Revision ID: 08f319b66df4
Revises: e956837b9aa5
Create Date: 2026-08-17 14:33:14.536999

Nota (2026-08-20): no-op. Los ondelete que esta migracion ajustaba ya
quedaron incluidos directo en las FKs del baseline regenerado
(65cc6ae752b0) -- ver nota en esa migracion.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '08f319b66df4'
down_revision: Union[str, None] = 'e956837b9aa5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

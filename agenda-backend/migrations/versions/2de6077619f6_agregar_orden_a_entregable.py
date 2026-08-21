"""agregar orden a entregable

Revision ID: 2de6077619f6
Revises: 65db28fa8343
Create Date: 2026-08-19 06:58:21.159229

Nota (2026-08-20): no-op. entregables.orden ya queda incluida directo en
el baseline regenerado (65cc6ae752b0) -- ver nota en esa migracion. El
backfill de esta migracion no aplica a una base nueva (no hay filas que
renumerar).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2de6077619f6'
down_revision: Union[str, None] = '65db28fa8343'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

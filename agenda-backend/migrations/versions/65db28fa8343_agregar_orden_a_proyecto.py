"""agregar orden a proyecto

Revision ID: 65db28fa8343
Revises: 8a86ce1ef8c1
Create Date: 2026-08-19 01:46:03.126349

Nota (2026-08-20): no-op. proyectos.orden (server_default='0',
nullable=False) ya queda incluida directo en el baseline regenerado
(65cc6ae752b0) -- ver nota en esa migracion. El backfill de esta migracion
no aplica a una base nueva (no hay filas que renumerar).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '65db28fa8343'
down_revision: Union[str, None] = '8a86ce1ef8c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

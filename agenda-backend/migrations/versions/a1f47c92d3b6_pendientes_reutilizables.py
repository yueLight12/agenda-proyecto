"""pendientes_reutilizables

Revision ID: a1f47c92d3b6
Revises: e3d12e8d90ca
Create Date: 2026-08-17 00:00:00.000000

Nota (2026-08-20): no-op. La tabla pendientes y agenda_items.pendiente_id
(con su FK) ya quedaron incluidas directo en el baseline regenerado
(65cc6ae752b0) -- ver nota en esa migracion.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a1f47c92d3b6'
down_revision: Union[str, None] = 'e3d12e8d90ca'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

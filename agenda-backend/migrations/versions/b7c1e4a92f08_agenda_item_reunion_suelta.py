"""agenda_item_reunion_suelta

Revision ID: b7c1e4a92f08
Revises: a1f47c92d3b6
Create Date: 2026-08-17 00:00:00.000000

Nota (2026-08-20): no-op. agenda_items.reunion_id (con su FK CASCADE) y
ck_agenda_item_serie_o_reunion ya quedaron incluidos directo en el baseline
regenerado (65cc6ae752b0) -- ver nota en esa migracion.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b7c1e4a92f08'
down_revision: Union[str, None] = 'a1f47c92d3b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

"""agrega nota.imagen_path

Revision ID: e8c4dce1119c
Revises: d81f6c3a9e52
Create Date: 2026-08-18 05:18:50.360410

Nota (2026-08-20): no-op. notas.imagen_path ya queda incluida directo en
el baseline regenerado (65cc6ae752b0) -- ver nota en esa migracion.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e8c4dce1119c'
down_revision: Union[str, None] = 'd81f6c3a9e52'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

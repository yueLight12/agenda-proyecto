"""pendiente_ondelete_cascade

Revision ID: d81f6c3a9e52
Revises: c4f92e1a7b3d
Create Date: 2026-08-17 00:00:00.000000

Nota (2026-08-20): no-op. pendientes.proyecto_id ya se crea con
ondelete='CASCADE' directo en el baseline regenerado (65cc6ae752b0) -- ver
nota en esa migracion.
"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd81f6c3a9e52'
down_revision: Union[str, None] = 'c4f92e1a7b3d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

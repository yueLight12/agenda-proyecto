"""agrega comentarios anidados a nota

Revision ID: 8a86ce1ef8c1
Revises: 87ff0608e076
Create Date: 2026-08-18 20:04:10.925549

Nota (2026-08-20): no-op. notas.nota_padre_id/pendiente_padre_id (con sus
FKs) y el check constraint de 6 columnas ya quedaron incluidos directo en
el baseline regenerado (65cc6ae752b0) -- ver nota en esa migracion.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8a86ce1ef8c1'
down_revision: Union[str, None] = '87ff0608e076'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

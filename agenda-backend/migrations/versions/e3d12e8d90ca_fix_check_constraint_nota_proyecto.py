"""fix_check_constraint_nota_proyecto

Revision ID: e3d12e8d90ca
Revises: 249ae1f20365
Create Date: 2026-08-17 18:34:06.914916

Nota (2026-08-20): no-op. El baseline regenerado (65cc6ae752b0) ya crea
ck_nota_exactamente_un_padre directo con su version final (6 columnas,
incluyendo nota_padre_id/pendiente_padre_id agregados por migraciones
posteriores a esta) -- ver nota en esa migracion.
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'e3d12e8d90ca'
down_revision: Union[str, None] = '249ae1f20365'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

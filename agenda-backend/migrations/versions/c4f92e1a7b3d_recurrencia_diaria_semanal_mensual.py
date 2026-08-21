"""recurrencia_diaria_semanal_mensual

Revision ID: c4f92e1a7b3d
Revises: b7c1e4a92f08
Create Date: 2026-08-17 00:00:00.000000

Nota (2026-08-20): no-op. series_reunion.tipo_recurrencia/dia_mes y
dia_semana nullable ya quedaron incluidos directo en el baseline
regenerado (65cc6ae752b0) -- ver nota en esa migracion.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'c4f92e1a7b3d'
down_revision: Union[str, None] = 'b7c1e4a92f08'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

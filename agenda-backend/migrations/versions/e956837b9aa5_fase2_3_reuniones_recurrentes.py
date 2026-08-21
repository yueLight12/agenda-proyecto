"""fase2_3_reuniones_recurrentes

Revision ID: e956837b9aa5
Revises: 65cc6ae752b0
Create Date: 2026-08-17 13:30:12.903558

Nota (2026-08-20): no-op. El cambio de esta migracion (reuniones.serie_id +
su FK a series_reunion) ya quedo incluido directo en el baseline
(65cc6ae752b0) al regenerarlo desde el estado real de los modelos -- ver
nota en esa migracion. Se deja vacia (en vez de borrarla) para no romper la
cadena de revisiones ya aplicadas en la base real.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e956837b9aa5'
down_revision: Union[str, None] = '65cc6ae752b0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

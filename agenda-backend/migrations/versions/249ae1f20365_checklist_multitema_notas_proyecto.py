"""checklist_multitema_notas_proyecto

Revision ID: 249ae1f20365
Revises: 08f319b66df4
Create Date: 2026-08-17 17:24:38.545521

Nota (2026-08-20): no-op. El valor 'nota' del enum tipoagendaitem y las
columnas agregadas aqui (agenda_items.nota_id/seccion_proyecto_id/detalle,
notas.proyecto_id) ya quedaron incluidas directo en el baseline regenerado
(65cc6ae752b0) -- ver nota en esa migracion.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '249ae1f20365'
down_revision: Union[str, None] = '08f319b66df4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

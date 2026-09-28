"""voz_asistente en preferencias_usuario

Revision ID: c001d1e5408b
Revises: 5b8be3736c43
Create Date: 2026-09-28 10:01:09.554398

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c001d1e5408b'
down_revision: Union[str, None] = '5b8be3736c43'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # OJO (2026-09-28): el autogenerate también detectó un drift no
    # relacionado (constraint único de suscripciones_push) -- se quitó a
    # mano, no es parte de esta tarea, no hay que tocarlo sin confirmar
    # primero con Yue. server_default aquí: preferencias_usuario ya tiene
    # filas reales (una por usuario que abrió "Personalizar apariencia"
    # alguna vez), agregar una columna NOT NULL sin default tronaría contra
    # esas filas existentes.
    op.add_column(
        'preferencias_usuario',
        sa.Column('voz_asistente', sa.String(length=40), nullable=False, server_default='es_MX-claude-high'),
    )


def downgrade() -> None:
    op.drop_column('preferencias_usuario', 'voz_asistente')

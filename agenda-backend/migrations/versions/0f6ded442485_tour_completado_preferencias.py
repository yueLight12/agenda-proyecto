"""tour_completado_preferencias

Revision ID: 0f6ded442485
Revises: 625ab316e9e1
Create Date: 2026-09-15 16:29:54.257092

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0f6ded442485'
down_revision: Union[str, None] = '625ab316e9e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # server_default=false() -- necesario para que las filas YA existentes
    # (creadas antes de este campo) queden en False en vez de fallar el
    # ALTER TABLE por NOT NULL sin valor. No se quita después: coincide con
    # el default=False del modelo, así que no hace daño dejarlo.
    #
    # Nota: no se incluye aquí el "drop_constraint('suscripciones_push_
    # endpoint_key', ...)" que detectó el autogenerate -- es drift previo
    # sin relación con este cambio (una diferencia entre el modelo actual y
    # una migración vieja), no algo que este cambio de FTUE deba tocar.
    op.add_column(
        'preferencias_usuario',
        sa.Column('tour_completado', sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column('preferencias_usuario', 'tour_completado')

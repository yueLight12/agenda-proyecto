"""agregar notas a series_reunion

Revision ID: 4500d682fc4c
Revises: c5d6e7f8a9b0
Create Date: 2026-08-24 22:35:03.721373

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4500d682fc4c'
down_revision: Union[str, None] = 'c5d6e7f8a9b0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # NOTA: el autogenerate tambien detecto un drop de la unique constraint
    # suscripciones_push_endpoint_key -- drift preexistente sin relacion con
    # este cambio (no se toco ese modelo aqui), se descarta a mano para no
    # tocar algo que no se pidio.
    op.add_column('series_reunion', sa.Column('notas', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('series_reunion', 'notas')

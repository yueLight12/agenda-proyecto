"""agenda_item_reunion_suelta

Revision ID: b7c1e4a92f08
Revises: a1f47c92d3b6
Create Date: 2026-08-17 00:00:00.000000

AgendaItem gana un segundo padre posible: reunion_id, para el checklist de
una reunión suelta (antes solo colgaba de una serie recurrente vía
serie_id). Exactamente uno de los dos, ver ck_agenda_item_serie_o_reunion
en app/models/agenda_item.py -- mismo patrón que ck_nota_exactamente_un_padre.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b7c1e4a92f08'
down_revision: Union[str, None] = 'a1f47c92d3b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('agenda_items', 'serie_id', existing_type=sa.Integer(), nullable=True)
    op.add_column('agenda_items', sa.Column('reunion_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_agenda_items_reunion_id_reuniones',
        'agenda_items',
        'reuniones',
        ['reunion_id'],
        ['id'],
        ondelete='CASCADE',
    )
    op.create_check_constraint(
        'ck_agenda_item_serie_o_reunion',
        'agenda_items',
        "(CASE WHEN serie_id IS NOT NULL THEN 1 ELSE 0 END + "
        "CASE WHEN reunion_id IS NOT NULL THEN 1 ELSE 0 END) = 1",
    )


def downgrade() -> None:
    op.drop_constraint('ck_agenda_item_serie_o_reunion', 'agenda_items', type_='check')
    op.drop_constraint('fk_agenda_items_reunion_id_reuniones', 'agenda_items', type_='foreignkey')
    op.drop_column('agenda_items', 'reunion_id')
    op.alter_column('agenda_items', 'serie_id', existing_type=sa.Integer(), nullable=False)

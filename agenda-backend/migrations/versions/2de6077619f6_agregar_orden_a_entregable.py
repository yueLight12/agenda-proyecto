"""agregar orden a entregable

Revision ID: 2de6077619f6
Revises: 65db28fa8343
Create Date: 2026-08-19 06:58:21.159229

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2de6077619f6'
down_revision: Union[str, None] = '65db28fa8343'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Nota: el índice 'ix_agenda_items_tema_activo_unico' aparece como
    # "removido" por drift de una migración anterior (no relacionado a este
    # cambio) -- se deja intacto aquí, solo se agrega la columna nueva.
    op.add_column('entregables', sa.Column('orden', sa.Integer(), server_default='0', nullable=False))
    # Backfill: orden por fecha_creacion dentro de cada proyecto, para que
    # los entregables ya existentes no queden todos empatados en 0.
    op.execute(
        """
        UPDATE entregables e
        SET orden = sub.rn
        FROM (
            SELECT id, ROW_NUMBER() OVER (
                PARTITION BY proyecto_id ORDER BY fecha_creacion, id
            ) AS rn
            FROM entregables
        ) sub
        WHERE e.id = sub.id
        """
    )
    op.alter_column('entregables', 'orden', server_default=None)


def downgrade() -> None:
    op.drop_column('entregables', 'orden')

"""recurrencia_diaria_semanal_mensual

Revision ID: c4f92e1a7b3d
Revises: b7c1e4a92f08
Create Date: 2026-08-17 00:00:00.000000

SerieReunion gana tipo_recurrencia (diaria/semanal/mensual, antes solo
soportaba semanal) y dia_mes -- dia_semana pasa a nullable porque ya no es
obligatorio para todos los tipos. Filas existentes se backfillean como
'semanal' para no cambiar su comportamiento.
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

tipo_recurrencia_enum = postgresql.ENUM('diaria', 'semanal', 'mensual', name='tiporecurrencia')


def upgrade() -> None:
    tipo_recurrencia_enum.create(op.get_bind(), checkfirst=True)
    op.add_column(
        'series_reunion',
        sa.Column(
            'tipo_recurrencia', tipo_recurrencia_enum, nullable=False, server_default='semanal'
        ),
    )
    op.alter_column('series_reunion', 'tipo_recurrencia', server_default=None)
    op.add_column('series_reunion', sa.Column('dia_mes', sa.Integer(), nullable=True))
    op.alter_column('series_reunion', 'dia_semana', existing_type=sa.Integer(), nullable=True)


def downgrade() -> None:
    op.alter_column('series_reunion', 'dia_semana', existing_type=sa.Integer(), nullable=False)
    op.drop_column('series_reunion', 'dia_mes')
    op.drop_column('series_reunion', 'tipo_recurrencia')
    tipo_recurrencia_enum.drop(op.get_bind(), checkfirst=True)

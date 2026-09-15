"""terminos_sensibles

Revision ID: 8cbafee39682
Revises: 0f6ded442485
Create Date: 2026-09-15 17:12:21.463344

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8cbafee39682'
down_revision: Union[str, None] = '0f6ded442485'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # No se incluye el "drop_constraint('suscripciones_push_endpoint_key',
    # ...)" que detectó el autogenerate -- es drift previo sin relación con
    # este cambio (mismo caso que en 0f6ded442485_tour_completado_preferencias.py).
    op.create_table('terminos_sensibles',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('texto', sa.String(length=200), nullable=False),
    sa.Column('creado_por', sa.Integer(), nullable=False),
    sa.Column('fecha_creacion', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['creado_por'], ['usuarios.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('texto')
    )
    op.create_index(op.f('ix_terminos_sensibles_id'), 'terminos_sensibles', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_terminos_sensibles_id'), table_name='terminos_sensibles')
    op.drop_table('terminos_sensibles')

"""auditoria_y_configuracion_app

Revision ID: ba423b186da3
Revises: 133877812708
Create Date: 2026-09-08 19:25:23.707322

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ba423b186da3'
down_revision: Union[str, None] = '133877812708'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('configuraciones_app',
    sa.Column('clave', sa.String(length=60), nullable=False),
    sa.Column('valor', sa.String(length=200), nullable=False),
    sa.Column('actualizado_por', sa.Integer(), nullable=True),
    sa.Column('fecha_actualizacion', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['actualizado_por'], ['usuarios.id'], ),
    sa.PrimaryKeyConstraint('clave')
    )
    op.create_table('registros_auditoria',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('actor_id', sa.Integer(), nullable=False),
    sa.Column('objetivo_id', sa.Integer(), nullable=True),
    sa.Column('accion', sa.String(length=50), nullable=False),
    sa.Column('detalle', sa.Text(), nullable=True),
    sa.Column('fecha', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['actor_id'], ['usuarios.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_registros_auditoria_fecha'), 'registros_auditoria', ['fecha'], unique=False)
    op.create_index(op.f('ix_registros_auditoria_id'), 'registros_auditoria', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_registros_auditoria_id'), table_name='registros_auditoria')
    op.drop_index(op.f('ix_registros_auditoria_fecha'), table_name='registros_auditoria')
    op.drop_table('registros_auditoria')
    op.drop_table('configuraciones_app')

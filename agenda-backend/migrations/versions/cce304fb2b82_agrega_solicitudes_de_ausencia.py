"""agrega solicitudes de ausencia

Revision ID: cce304fb2b82
Revises: aff57c0b18e7
Create Date: 2026-09-23 08:56:59.187347

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'cce304fb2b82'
down_revision: Union[str, None] = 'aff57c0b18e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Solo las tablas nuevas -- se quitó a mano el drop de índice/constraint
    # ajeno que el autogenerate arrastró de la base local usada para
    # generar esto (mismo caso que la migración anterior, aff57c0b18e7).
    op.create_table('solicitudes_ausencia',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('solicitante_id', sa.Integer(), nullable=False),
    sa.Column('aprobador_id', sa.Integer(), nullable=True),
    sa.Column('tipo', sa.Enum('vacaciones', 'permiso', 'incapacidad', name='tipoausencia'), nullable=False),
    sa.Column('fecha_inicio', sa.Date(), nullable=False),
    sa.Column('fecha_fin', sa.Date(), nullable=False),
    sa.Column('estatus', sa.Enum('pendiente', 'aprobada', 'rechazada', name='estatussolicitudausencia'), nullable=False),
    sa.Column('nota_rechazo', sa.Text(), nullable=True),
    sa.Column('fecha_creacion', sa.DateTime(), nullable=False),
    sa.Column('fecha_resolucion', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['aprobador_id'], ['usuarios.id'], ),
    sa.ForeignKeyConstraint(['solicitante_id'], ['usuarios.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_solicitudes_ausencia_id'), 'solicitudes_ausencia', ['id'], unique=False)
    op.create_table('solicitud_ausencia_copiados',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('solicitud_id', sa.Integer(), nullable=False),
    sa.Column('usuario_id', sa.Integer(), nullable=False),
    sa.Column('fecha_creacion', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['solicitud_id'], ['solicitudes_ausencia.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['usuario_id'], ['usuarios.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_solicitud_ausencia_copiados_id'), 'solicitud_ausencia_copiados', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_solicitud_ausencia_copiados_id'), table_name='solicitud_ausencia_copiados')
    op.drop_table('solicitud_ausencia_copiados')
    op.drop_index(op.f('ix_solicitudes_ausencia_id'), table_name='solicitudes_ausencia')
    op.drop_table('solicitudes_ausencia')
    # ### end Alembic commands ###

"""agregar requiere_comprobante y comprobante_path a entregable

Revision ID: 9c7d4e1a5f2b
Revises: 5081d26d7d66
Create Date: 2026-08-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9c7d4e1a5f2b'
down_revision: Union[str, None] = '5081d26d7d66'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # server_default necesario (2026-08-21): la tabla entregables ya tiene
    # filas reales -- sin un valor de respaldo, el ALTER TABLE con
    # NOT NULL fallaría al no saber qué poner en esas filas existentes.
    # Se quita el default después del backfill (mismo patrón ya usado en
    # 5081d26d7d66 para 'aviso_acceso_enviado' y en la migración original
    # de 'urgente_manual') para que quede como nullable=False sin default
    # real de aquí en adelante.
    op.add_column(
        'entregables',
        sa.Column('requiere_comprobante', sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.alter_column('entregables', 'requiere_comprobante', server_default=None)
    op.add_column(
        'entregables',
        sa.Column('comprobante_path', sa.String(length=300), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('entregables', 'comprobante_path')
    op.drop_column('entregables', 'requiere_comprobante')

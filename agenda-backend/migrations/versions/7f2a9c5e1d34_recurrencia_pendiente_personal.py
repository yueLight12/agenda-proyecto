"""recurrencia_pendiente_personal

Revision ID: 7f2a9c5e1d34
Revises: 91b59fc1dec1
Create Date: 2026-09-02 00:00:00.000000

Agrega `recurrencia` a pendientes_personales (2026-09-02, a peticion de
Yue: poder marcar "cada mes tengo que pagar la colegiatura" como
recurrente). Ver app/models/pendiente_personal.py y
app/services/pendientes_personales.py.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '7f2a9c5e1d34'
down_revision: Union[str, None] = '91b59fc1dec1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "pendientes_personales",
        sa.Column("recurrencia", sa.String(length=10), nullable=False, server_default="ninguna"),
    )
    op.alter_column("pendientes_personales", "recurrencia", server_default=None)


def downgrade() -> None:
    op.drop_column("pendientes_personales", "recurrencia")

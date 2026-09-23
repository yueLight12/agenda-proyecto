"""agrega columna aislado a usuarios

Revision ID: a4c08bade9eb
Revises: cce304fb2b82
Create Date: 2026-09-23 12:21:38.251397

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a4c08bade9eb'
down_revision: Union[str, None] = 'cce304fb2b82'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Solo la columna nueva -- se quitó a mano el drop de índice/constraint
    # ajeno que el autogenerate arrastró (mismo caso que migraciones
    # anteriores). `server_default` es necesario: la tabla `usuarios` en
    # la base real ya tiene filas -- un NOT NULL sin default fallaría al
    # aplicarse ahí.
    op.add_column(
        'usuarios',
        sa.Column('aislado', sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column('usuarios', 'aislado')

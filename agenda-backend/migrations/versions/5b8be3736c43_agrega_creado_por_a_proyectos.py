"""agrega creado_por a proyectos

Revision ID: 5b8be3736c43
Revises: a4c08bade9eb
Create Date: 2026-09-24 13:31:12.038843

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5b8be3736c43'
down_revision: Union[str, None] = 'a4c08bade9eb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Solo la columna nueva -- se quitó a mano el drop de índice/constraint
    # ajeno que el autogenerate arrastró (mismo caso que migraciones
    # anteriores, ver CLAUDE.md).
    op.add_column('proyectos', sa.Column('creado_por', sa.Integer(), nullable=True))
    op.create_foreign_key(None, 'proyectos', 'usuarios', ['creado_por'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    op.drop_constraint(None, 'proyectos', type_='foreignkey')
    op.drop_column('proyectos', 'creado_por')

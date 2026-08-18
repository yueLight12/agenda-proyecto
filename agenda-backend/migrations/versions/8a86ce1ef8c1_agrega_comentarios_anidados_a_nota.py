"""agrega comentarios anidados a nota

Revision ID: 8a86ce1ef8c1
Revises: 87ff0608e076
Create Date: 2026-08-18 20:04:10.925549

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8a86ce1ef8c1'
down_revision: Union[str, None] = '87ff0608e076'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # NOTA: autogenerate propuso también DROP del índice único parcial
    # ix_agenda_items_tema_activo_unico (falso positivo -- no compara bien
    # índices parciales con postgresql_where contra el modelo, ver
    # migración 87ff0608e076). Se quitó a mano de aquí, ese índice sigue
    # intacto.
    op.add_column('notas', sa.Column('nota_padre_id', sa.Integer(), nullable=True))
    op.add_column('notas', sa.Column('pendiente_padre_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'notas_nota_padre_id_fkey', 'notas', 'notas', ['nota_padre_id'], ['id'], ondelete='CASCADE'
    )
    op.create_foreign_key(
        'notas_pendiente_padre_id_fkey', 'notas', 'pendientes', ['pendiente_padre_id'], ['id'],
        ondelete='CASCADE',
    )
    # autogenerate no compara el CUERPO de un CheckConstraint ya existente
    # (lección ya documentada, ver migración e3d12e8d90ca) -- se actualiza a
    # mano para contar también los 2 padres nuevos.
    op.drop_constraint('ck_nota_exactamente_un_padre', 'notas', type_='check')
    op.create_check_constraint(
        'ck_nota_exactamente_un_padre',
        'notas',
        "(CASE WHEN entregable_id IS NOT NULL THEN 1 ELSE 0 END + "
        "CASE WHEN reunion_id IS NOT NULL THEN 1 ELSE 0 END + "
        "CASE WHEN minuta_id IS NOT NULL THEN 1 ELSE 0 END + "
        "CASE WHEN proyecto_id IS NOT NULL THEN 1 ELSE 0 END + "
        "CASE WHEN nota_padre_id IS NOT NULL THEN 1 ELSE 0 END + "
        "CASE WHEN pendiente_padre_id IS NOT NULL THEN 1 ELSE 0 END) = 1",
    )


def downgrade() -> None:
    op.drop_constraint('ck_nota_exactamente_un_padre', 'notas', type_='check')
    op.create_check_constraint(
        'ck_nota_exactamente_un_padre',
        'notas',
        "(CASE WHEN entregable_id IS NOT NULL THEN 1 ELSE 0 END + "
        "CASE WHEN reunion_id IS NOT NULL THEN 1 ELSE 0 END + "
        "CASE WHEN minuta_id IS NOT NULL THEN 1 ELSE 0 END + "
        "CASE WHEN proyecto_id IS NOT NULL THEN 1 ELSE 0 END) = 1",
    )
    op.drop_constraint('notas_pendiente_padre_id_fkey', 'notas', type_='foreignkey')
    op.drop_constraint('notas_nota_padre_id_fkey', 'notas', type_='foreignkey')
    op.drop_column('notas', 'pendiente_padre_id')
    op.drop_column('notas', 'nota_padre_id')

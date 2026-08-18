"""pendiente_ondelete_cascade

Revision ID: d81f6c3a9e52
Revises: c4f92e1a7b3d
Create Date: 2026-08-17 00:00:00.000000

Bug real: pendientes.proyecto_id no tenía ON DELETE CASCADE ni relación
declarada en Proyecto -- eliminar un tema con pendientes reales tronaba con
un IntegrityError (ForeignKeyViolation) en vez de borrar en cascada, igual
que ya pasa con Nota/Entregable/Reunion. Corrige la FK para que coincida
con el patrón del resto del modelo.
"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd81f6c3a9e52'
down_revision: Union[str, None] = 'c4f92e1a7b3d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint('pendientes_proyecto_id_fkey', 'pendientes', type_='foreignkey')
    op.create_foreign_key(
        'pendientes_proyecto_id_fkey',
        'pendientes',
        'proyectos',
        ['proyecto_id'],
        ['id'],
        ondelete='CASCADE',
    )


def downgrade() -> None:
    op.drop_constraint('pendientes_proyecto_id_fkey', 'pendientes', type_='foreignkey')
    op.create_foreign_key(
        'pendientes_proyecto_id_fkey',
        'pendientes',
        'proyectos',
        ['proyecto_id'],
        ['id'],
    )

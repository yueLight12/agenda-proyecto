"""fix_check_constraint_nota_proyecto

Revision ID: e3d12e8d90ca
Revises: 249ae1f20365
Create Date: 2026-08-17 18:34:06.914916

Alembic autogenerate no detecta cambios en el CUERPO de un CheckConstraint
ya existente (solo detecta que la columna/FK de notas.proyecto_id se
agregaron) -- la migración anterior (249ae1f20365) dejó viva la versión
VIEJA de ck_nota_exactamente_un_padre (solo entregable/reunion/minuta,
sin proyecto_id), así que crear una nota solo con proyecto_id fallaba con
CheckViolation (encontrado en producción probando la sección de Notas de
un tema). Esta migración reemplaza el constraint por la versión de 4
columnas que ya coincide con app/models/nota.py.
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'e3d12e8d90ca'
down_revision: Union[str, None] = '249ae1f20365'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint('ck_nota_exactamente_un_padre', 'notas', type_='check')
    op.create_check_constraint(
        'ck_nota_exactamente_un_padre',
        'notas',
        "(CASE WHEN entregable_id IS NOT NULL THEN 1 ELSE 0 END + "
        "CASE WHEN reunion_id IS NOT NULL THEN 1 ELSE 0 END + "
        "CASE WHEN minuta_id IS NOT NULL THEN 1 ELSE 0 END + "
        "CASE WHEN proyecto_id IS NOT NULL THEN 1 ELSE 0 END) = 1",
    )


def downgrade() -> None:
    op.drop_constraint('ck_nota_exactamente_un_padre', 'notas', type_='check')
    op.create_check_constraint(
        'ck_nota_exactamente_un_padre',
        'notas',
        "(CASE WHEN entregable_id IS NOT NULL THEN 1 ELSE 0 END + "
        "CASE WHEN reunion_id IS NOT NULL THEN 1 ELSE 0 END + "
        "CASE WHEN minuta_id IS NOT NULL THEN 1 ELSE 0 END) = 1",
    )

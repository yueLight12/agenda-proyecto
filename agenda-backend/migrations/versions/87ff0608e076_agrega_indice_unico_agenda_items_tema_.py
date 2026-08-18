"""agrega indice unico agenda_items tema activo

Revision ID: 87ff0608e076
Revises: e8c4dce1119c
Create Date: 2026-08-18 07:35:51.521958

Índice único parcial: a lo mucho un AgendaItem tipo=tema ACTIVO por
(serie_id, reunion_id, proyecto_id) -- evita a nivel de base de datos el
duplicado que hasta ahora solo se colapsaba en código (actualizar_temas)
cada vez que se volvía a guardar el árbol de checkboxes. Ese colapso en
código no cerraba la ventana de carrera entre dos peticiones PUT casi
simultáneas (mismo clic doble que ya se mitigó deshabilitando el checkbox
mientras guarda, del lado del frontend) -- este índice es el cierre real,
a nivel de base de datos: la segunda inserción concurrente truena con
IntegrityError en vez de crear un segundo ítem activo.

Como `serie_id`/`reunion_id` son mutuamente excluyentes por ítem (ver
CheckConstraint ck_agenda_item_serie_o_reunion en app/models/agenda_item.py),
un solo índice sobre las tres columnas cubre ambos casos (junta recurrente
y reunión suelta) sin necesitar dos índices separados -- SIEMPRE que la
comparación trate dos NULL como iguales entre sí para efectos de
unicidad. Un UNIQUE índice estándar en SQL NO hace eso (NULL != NULL,
incluso en el mismo índice) -- se necesita `NULLS NOT DISTINCT`
(Postgres 15+, este proyecto corre 16) para que dos ítems de una misma
serie (reunion_id siempre NULL ahí) sí choquen entre sí. Sin esto el
índice existe pero no protege nada en el caso real: se comprobó con una
prueba de concurrencia real (dos hilos, mismo tema, misma serie) que sin
`NULLS NOT DISTINCT` ambos inserts pasaban y quedaban dos ítems activos
duplicados -- el índice "único" no detectaba el choque porque
reunion_id=NULL nunca se consideraba igual a otro reunion_id=NULL.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '87ff0608e076'
down_revision: Union[str, None] = 'e8c4dce1119c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_agenda_items_tema_activo_unico",
        "agenda_items",
        ["serie_id", "reunion_id", "proyecto_id"],
        unique=True,
        postgresql_where=sa.text("tipo = 'tema' AND activo = true"),
        postgresql_nulls_not_distinct=True,
    )


def downgrade() -> None:
    op.drop_index("ix_agenda_items_tema_activo_unico", table_name="agenda_items")

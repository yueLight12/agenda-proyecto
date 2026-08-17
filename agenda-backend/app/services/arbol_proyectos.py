"""
Helpers de árbol para Proyecto (generalizado a "temas/subtemas" anidables a
cualquier profundidad, ver Proyecto.parent_id). Carga todo el árbol en
memoria y resuelve ancestros/descendientes en Python (BFS sobre un
diccionario) en vez de CTE recursivo, closure table o `ltree` -- a la
escala real de este sistema (decenas/bajos cientos de nodos, corriendo en
una Raspberry Pi) es la opción más simple: un único SELECT trivial (índice
de PK, unos KB de datos) y sin ningún estado denormalizado que pueda
desincronizarse (parent_id es el único dato de verdad, siempre -- no hay
`path` ni `profundidad` que se puedan desalinear tras mover un nodo).

Si el árbol llegara a crecer mucho (miles de nodos), este módulo es el
candidato a reemplazar por una recursive CTE -- mismas firmas de función,
cambia solo la implementación interna.
"""
from dataclasses import dataclass
from typing import Optional

from sqlalchemy.orm import Session

from app.models.proyecto import Proyecto


@dataclass
class NodoArbol:
    id: int
    parent_id: Optional[int]
    nombre: str
    activo: bool


def cargar_indice(db: Session) -> dict[int, NodoArbol]:
    filas = db.query(
        Proyecto.id, Proyecto.parent_id, Proyecto.nombre, Proyecto.activo
    ).all()
    return {
        fila.id: NodoArbol(
            id=fila.id, parent_id=fila.parent_id, nombre=fila.nombre, activo=fila.activo
        )
        for fila in filas
    }


def _mapa_hijos(indice: dict[int, NodoArbol]) -> dict[Optional[int], list[int]]:
    mapa: dict[Optional[int], list[int]] = {}
    for nodo in indice.values():
        mapa.setdefault(nodo.parent_id, []).append(nodo.id)
    return mapa


def cadena_ancestros(indice: dict[int, NodoArbol], nodo_id: int) -> list[int]:
    """nodo_id primero, luego su padre, abuelo, ... hasta la raíz. `vistos`
    protege contra un ciclo de datos corrupto (no debería poder existir,
    ver es_descendiente/mover_nodo, pero evita un loop infinito si pasara)."""
    cadena = []
    actual: Optional[int] = nodo_id
    vistos: set[int] = set()
    while actual is not None and actual not in vistos:
        cadena.append(actual)
        vistos.add(actual)
        nodo = indice.get(actual)
        actual = nodo.parent_id if nodo else None
    return cadena


def hijos_directos_ids(indice: dict[int, NodoArbol], nodo_id: int) -> list[int]:
    return _mapa_hijos(indice).get(nodo_id, [])


def ids_subarbol(indice: dict[int, NodoArbol], raiz_id: int) -> set[int]:
    """BFS: raiz_id + todos sus descendientes, a cualquier profundidad."""
    mapa_hijos = _mapa_hijos(indice)
    resultado = {raiz_id}
    pendientes = [raiz_id]
    while pendientes:
        actual = pendientes.pop()
        for hijo_id in mapa_hijos.get(actual, []):
            if hijo_id not in resultado:
                resultado.add(hijo_id)
                pendientes.append(hijo_id)
    return resultado


def es_descendiente(
    indice: dict[int, NodoArbol], nodo_id: int, posible_ancestro_id: int
) -> bool:
    """True si nodo_id es el mismo posible_ancestro_id o vive dentro de su
    subárbol -- usado para prevenir ciclos al mover un nodo (no se puede
    mover un nodo dentro de su propio descendiente, ni de sí mismo)."""
    return nodo_id in ids_subarbol(indice, posible_ancestro_id)

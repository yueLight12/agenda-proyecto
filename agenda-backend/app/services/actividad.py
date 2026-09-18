"""
Actividad reciente para el superadmin (2026-09-17, "opción A" -- a
diferencia de app/services/auditoria.py, que solo cubre acciones de
superadmin, esto junta lo que YA guardan varias tablas del uso normal de
la app (login, tareas creadas, avances, reuniones agendadas, notas) en una
sola línea de tiempo, sin agregar ningún registro nuevo. Límite real: solo
se conoce el ÚLTIMO login de cada persona (Usuario.ultimo_login no guarda
historial), y no hay ningún registro de intentos fallidos -- ver la
conversación con Yue del 2026-09-17 para el resto de limitaciones.
"""
from app.models.entregable import Entregable
from app.models.historial_avance import HistorialAvance
from app.models.nota import Nota
from app.models.reunion import Reunion
from app.models.usuario import Usuario


def _preview(texto: str, largo: int = 60) -> str:
    texto = (texto or "").strip()
    return texto if len(texto) <= largo else f"{texto[:largo]}…"


def listar_actividad_reciente(db, limite: int = 300) -> list[dict]:
    nombres_por_id = dict(db.query(Usuario.id, Usuario.nombre).all())
    eventos: list[dict] = []

    for usuario_id, ultimo_login in db.query(Usuario.id, Usuario.ultimo_login).filter(
        Usuario.ultimo_login.isnot(None)
    ):
        eventos.append(
            {
                "fecha": ultimo_login,
                "usuario_id": usuario_id,
                "usuario_nombre": nombres_por_id.get(usuario_id, "?"),
                "tipo": "login",
                "descripcion": "Inició sesión",
            }
        )

    for nombre_tarea, creado_por, fecha in db.query(
        Entregable.nombre, Entregable.creado_por, Entregable.fecha_creacion
    ):
        eventos.append(
            {
                "fecha": fecha,
                "usuario_id": creado_por,
                "usuario_nombre": nombres_por_id.get(creado_por, "?"),
                "tipo": "tarea_creada",
                "descripcion": f'Creó la tarea "{nombre_tarea}"',
            }
        )

    nombres_entregable_por_id = dict(db.query(Entregable.id, Entregable.nombre).all())
    for entregable_id, porcentaje, actualizado_por, fecha in db.query(
        HistorialAvance.entregable_id,
        HistorialAvance.porcentaje_avance,
        HistorialAvance.actualizado_por,
        HistorialAvance.fecha_registro,
    ):
        nombre_tarea = nombres_entregable_por_id.get(entregable_id, "una tarea (ya eliminada)")
        eventos.append(
            {
                "fecha": fecha,
                "usuario_id": actualizado_por,
                "usuario_nombre": nombres_por_id.get(actualizado_por, "?"),
                "tipo": "avance_actualizado",
                "descripcion": f'Actualizó el avance de "{nombre_tarea}" a {porcentaje}%',
            }
        )

    for titulo, organizador_id, fecha in db.query(
        Reunion.titulo, Reunion.organizador_id, Reunion.fecha_creacion
    ):
        eventos.append(
            {
                "fecha": fecha,
                "usuario_id": organizador_id,
                "usuario_nombre": nombres_por_id.get(organizador_id, "?"),
                "tipo": "reunion_agendada",
                "descripcion": f'Agendó la reunión "{titulo}"',
            }
        )

    for contenido, autor_id, fecha in db.query(Nota.contenido, Nota.autor_id, Nota.fecha_creacion):
        eventos.append(
            {
                "fecha": fecha,
                "usuario_id": autor_id,
                "usuario_nombre": nombres_por_id.get(autor_id, "?"),
                "tipo": "nota_agregada",
                "descripcion": f'Agregó una nota: "{_preview(contenido)}"',
            }
        )

    eventos.sort(key=lambda e: e["fecha"], reverse=True)
    return eventos[:limite]

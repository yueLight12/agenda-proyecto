"""
Script de limpieza de datos de proyectos: borra TODOS los proyectos actuales
y todo lo que cuelga de ellos (entregables, reuniones, minutas, acuerdos,
notas, historial de avance, y las notificaciones ligadas a esos entregables).

NO toca: usuarios (se conservan, solo pierden sus roles de proyecto viejos),
equipo_miembros (plantilla personal, no depende de proyecto), eventos_empresa
ni las notificaciones de cumpleaños (usan evento_empresa_id, no entregable_id).

Uso:
    python limpiar_datos_proyectos.py             # dry-run: solo cuenta, no borra nada
    python limpiar_datos_proyectos.py --ejecutar   # borra de verdad

Orden de borrado (mismo orden usado a mano para la limpieza de datos demo del
2026-08-12, documentado en CLAUDE.md — ninguna FK tiene ON DELETE CASCADE):
acuerdos_minuta -> historial_avance -> notas -> notificaciones (solo las
ligadas a un entregable) -> reunion_participantes -> minutas -> reuniones ->
entregables -> usuario_proyecto_rol -> proyectos.
"""
import sys

from sqlalchemy import or_

from app.database import SessionLocal
from app.models.entregable import Entregable
from app.models.historial_avance import HistorialAvance
from app.models.minuta import AcuerdoMinuta, Minuta
from app.models.nota import Nota
from app.models.notificacion import Notificacion
from app.models.proyecto import Proyecto
from app.models.reunion import Reunion, ReunionParticipante
from app.models.usuario_proyecto_rol import UsuarioProyectoRol


def _ids_actuales(db):
    return (
        [row[0] for row in db.query(Entregable.id).all()],
        [row[0] for row in db.query(Reunion.id).all()],
        [row[0] for row in db.query(Minuta.id).all()],
    )


def _conteos(db):
    ids_entregables, ids_reuniones, ids_minutas = _ids_actuales(db)
    return {
        "proyectos": db.query(Proyecto).count(),
        "usuario_proyecto_rol": db.query(UsuarioProyectoRol).count(),
        "entregables": len(ids_entregables),
        "reuniones": len(ids_reuniones),
        "minutas": len(ids_minutas),
        "acuerdos_minuta": db.query(AcuerdoMinuta)
        .filter(AcuerdoMinuta.minuta_id.in_(ids_minutas))
        .count(),
        "reunion_participantes": db.query(ReunionParticipante)
        .filter(ReunionParticipante.reunion_id.in_(ids_reuniones))
        .count(),
        "historial_avance": db.query(HistorialAvance)
        .filter(HistorialAvance.entregable_id.in_(ids_entregables))
        .count(),
        "notas": db.query(Nota)
        .filter(
            or_(
                Nota.entregable_id.in_(ids_entregables),
                Nota.reunion_id.in_(ids_reuniones),
                Nota.minuta_id.in_(ids_minutas),
            )
        )
        .count(),
        "notificaciones (ligadas a un entregable)": db.query(Notificacion)
        .filter(Notificacion.entregable_id.in_(ids_entregables))
        .count(),
    }


def _borrar(db):
    ids_entregables, ids_reuniones, ids_minutas = _ids_actuales(db)

    db.query(AcuerdoMinuta).filter(AcuerdoMinuta.minuta_id.in_(ids_minutas)).delete(
        synchronize_session=False
    )
    db.query(HistorialAvance).filter(
        HistorialAvance.entregable_id.in_(ids_entregables)
    ).delete(synchronize_session=False)
    db.query(Nota).filter(
        or_(
            Nota.entregable_id.in_(ids_entregables),
            Nota.reunion_id.in_(ids_reuniones),
            Nota.minuta_id.in_(ids_minutas),
        )
    ).delete(synchronize_session=False)
    db.query(Notificacion).filter(
        Notificacion.entregable_id.in_(ids_entregables)
    ).delete(synchronize_session=False)
    db.query(ReunionParticipante).filter(
        ReunionParticipante.reunion_id.in_(ids_reuniones)
    ).delete(synchronize_session=False)
    db.query(Minuta).filter(Minuta.id.in_(ids_minutas)).delete(synchronize_session=False)
    db.query(Reunion).filter(Reunion.id.in_(ids_reuniones)).delete(synchronize_session=False)
    db.query(Entregable).filter(Entregable.id.in_(ids_entregables)).delete(
        synchronize_session=False
    )
    db.query(UsuarioProyectoRol).delete(synchronize_session=False)
    db.query(Proyecto).delete(synchronize_session=False)


def main():
    ejecutar = "--ejecutar" in sys.argv[1:]
    db = SessionLocal()
    try:
        conteos = _conteos(db)
        print("Se eliminarán:" if ejecutar else "Se ELIMINARÍAN (dry-run, nada se toca todavía):")
        for tabla, n in conteos.items():
            print(f"  {tabla}: {n}")

        if not ejecutar:
            print("\nCorre con --ejecutar para aplicar de verdad.")
            return

        _borrar(db)
        db.commit()
        print("\nListo — datos de proyectos eliminados.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()

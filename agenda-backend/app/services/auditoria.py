"""
Servicio de auditoría (2026-09-07) -- ver app/models/registro_auditoria.py
para el porqué. `registrar` NUNCA lanza (un fallo al auditar no debe
tumbar la acción real que se está auditando), igual que enviar_whatsapp.
"""
import json

from sqlalchemy.orm import Session

from app.models.registro_auditoria import RegistroAuditoria
from app.models.usuario import Usuario


def registrar(
    db: Session, actor: Usuario, accion: str, objetivo_id: int | None = None, detalle: dict | None = None
) -> None:
    try:
        db.add(
            RegistroAuditoria(
                actor_id=actor.id,
                objetivo_id=objetivo_id,
                accion=accion,
                detalle=json.dumps(detalle, ensure_ascii=False) if detalle else None,
            )
        )
        db.commit()
    except Exception:
        db.rollback()


def listar_recientes(db: Session, limite: int = 200) -> list[dict]:
    registros = (
        db.query(RegistroAuditoria)
        .order_by(RegistroAuditoria.fecha.desc())
        .limit(limite)
        .all()
    )
    ids_actores = {r.actor_id for r in registros}
    ids_objetivos = {r.objetivo_id for r in registros if r.objetivo_id is not None}
    nombres = {
        u.id: u.nombre
        for u in db.query(Usuario).filter(Usuario.id.in_(ids_actores | ids_objetivos)).all()
    }
    resultado = []
    for r in registros:
        detalle = json.loads(r.detalle) if r.detalle else None
        objetivo_nombre = None
        if r.objetivo_id is not None:
            # Si el objetivo ya no existe (típico tras "eliminar_usuario"),
            # se usa el nombre que quedó guardado en `detalle` en el
            # momento de la acción -- ver eliminar_usuario en
            # app/routers/usuarios.py, que lo captura ANTES de borrar.
            objetivo_nombre = nombres.get(r.objetivo_id) or (detalle or {}).get("nombre")
        resultado.append(
            {
                "id": r.id,
                "fecha": r.fecha,
                "actor_id": r.actor_id,
                "actor_nombre": nombres.get(r.actor_id, "(desconocido)"),
                "accion": r.accion,
                "objetivo_id": r.objetivo_id,
                "objetivo_nombre": objetivo_nombre,
                "detalle": detalle,
            }
        )
    return resultado

"""
Diccionario de términos prohibidos (2026-09-15, a petición de Yue) -- ver
app/models/termino_sensible.py para el porqué. Este módulo tiene dos
mitades:

1. CRUD del diccionario en sí (listar/agregar/quitar), usado por
   app/routers/admin.py, restringido a superadmin.
2. `verificar_contenido`, el guardia que llaman los servicios de creación/
   edición (entregables, reuniones, proyectos, notas) ANTES de guardar --
   si algún campo de texto contiene un término prohibido, aborta con
   HTTPException 400 y deja un registro en la auditoría existente (mismo
   mecanismo que ya usa app/services/auditoria.py para otras acciones de
   superadmin, reusado aquí para acciones de CUALQUIER usuario que dispare
   el bloqueo -- por eso `actor` aquí es quien intentó la acción, no
   necesariamente un admin).
"""
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from fastapi import HTTPException, status

from app.models.termino_sensible import TerminoSensible
from app.models.usuario import Usuario
from app.services import auditoria


def listar_terminos(db: Session) -> list[TerminoSensible]:
    return db.query(TerminoSensible).order_by(TerminoSensible.texto).all()


def agregar_termino(db: Session, actor: Usuario, texto: str) -> TerminoSensible:
    texto = texto.strip()
    if not texto:
        raise HTTPException(status_code=400, detail="El término no puede estar vacío")

    termino = TerminoSensible(texto=texto, creado_por=actor.id)
    db.add(termino)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Ese término ya está en la lista")
    db.refresh(termino)
    return termino


def quitar_termino(db: Session, termino_id: int) -> None:
    termino = db.query(TerminoSensible).filter(TerminoSensible.id == termino_id).first()
    if not termino:
        raise HTTPException(status_code=404, detail="Ese término no existe")
    db.delete(termino)
    db.commit()


def _termino_encontrado_en(terminos: list[str], *textos: str | None) -> str | None:
    """Primer término de la lista que aparece como substring (sin
    distinguir mayúsculas/minúsculas) en cualquiera de `textos`. None si
    ninguno aplica -- textos vacíos/None se ignoran."""
    contenido = " ".join(t for t in textos if t).lower()
    if not contenido:
        return None
    for termino in terminos:
        if termino.lower() in contenido:
            return termino
    return None


def verificar_contenido(db: Session, actor: Usuario, entidad: str, **campos: str | None) -> None:
    """Revisa los valores de `campos` (ej. nombre="...", descripcion="...")
    contra el diccionario de términos prohibidos. Si encuentra alguno,
    NUNCA deja pasar la acción -- levanta 400 con un mensaje genérico (no
    revela CUÁL término disparó el bloqueo, para no convertir el mensaje de
    error en una forma de descubrir la lista completa a punta de prueba y
    error) y registra el intento completo en la auditoría, donde el
    superadmin sí ve el término exacto, la entidad y el texto recortado.

    `entidad` es solo una etiqueta legible para el registro (ej.
    "entregable", "reunion", "proyecto", "nota") -- no se valida contra
    nada."""
    terminos = [t.texto for t in listar_terminos(db)]
    if not terminos:
        return

    encontrado = _termino_encontrado_en(terminos, *campos.values())
    if encontrado is None:
        return

    auditoria.registrar(
        db,
        actor,
        "contenido_sensible_bloqueado",
        None,
        {
            "entidad": entidad,
            "termino": encontrado,
            # Recortado a 300 caracteres -- es un registro de auditoría,
            # no un respaldo del contenido completo.
            "campos": {k: (v[:300] if v else v) for k, v in campos.items()},
        },
    )
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Este contenido incluye información sensible y no se puede guardar.",
    )

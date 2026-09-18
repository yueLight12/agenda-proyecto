"""
Servicio de intentos fallidos ("Opción B", 2026-09-17). Ver
app/models/intento_fallido.py para el contexto completo.

`registrar` abre su PROPIA sesión de BD (no reutiliza la de la petición
que falló -- esa sesión puede estar en un estado roto tras un error real,
ver el middleware en app/main.py) y nunca deja que un fallo al loguear
tumbe la respuesta real que le llega al usuario -- por diseño, cualquier
excepción aquí dentro se traga silenciosamente (con un print a stderr
para no perderla del todo).
"""
from typing import Optional

from app.database import SessionLocal
from app.models.intento_fallido import IntentoFallido
from app.models.usuario import Usuario


def registrar(
    *,
    usuario_id: Optional[int],
    correo_intentado: Optional[str],
    metodo: str,
    ruta: str,
    status_code: int,
    detalle: Optional[str],
) -> None:
    db = SessionLocal()
    try:
        db.add(
            IntentoFallido(
                usuario_id=usuario_id,
                correo_intentado=correo_intentado,
                metodo=metodo,
                ruta=ruta,
                status_code=status_code,
                detalle=(detalle or "")[:2000] or None,
            )
        )
        db.commit()
    except Exception as exc:  # noqa: BLE001 -- a propósito, ver docstring
        print(f"[intentos_fallidos] no se pudo registrar: {exc}")
    finally:
        db.close()


def listar_recientes(db, limite: int = 300) -> list[dict]:
    nombres_por_id = dict(db.query(Usuario.id, Usuario.nombre).all())
    filas = (
        db.query(IntentoFallido)
        .order_by(IntentoFallido.fecha.desc())
        .limit(limite)
        .all()
    )
    return [
        {
            "id": f.id,
            "fecha": f.fecha,
            "usuario_id": f.usuario_id,
            "usuario_nombre": nombres_por_id.get(f.usuario_id) if f.usuario_id else None,
            "correo_intentado": f.correo_intentado,
            "metodo": f.metodo,
            "ruta": f.ruta,
            "status_code": f.status_code,
            "detalle": f.detalle,
        }
        for f in filas
    ]

"""
Servicio de administración global (superadmin) -- 2026-09-07, a petición
de Yue tras preguntar "qué más debería poder hacer un superadmin que un
usuario normal no": reasignar en bloque todo lo de una persona a otra,
pensado sobre todo para poder "vaciar" a alguien ANTES de eliminarlo (ver
DELETE /usuarios/{id}, que bloquea el borrado si aún tiene historial
asociado -- ver app/routers/usuarios.py).

No reasigna nada 100% privado de la persona (preferencias, pendientes
personales, suscripciones push) -- eso se va con ella si se elimina
después (tienen ON DELETE CASCADE, ver los modelos), no tiene sentido
"heredarlo" a alguien más.
"""
from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import crear_access_token
from app.models.agenda_item import AgendaItemRevision
from app.models.entregable import Entregable
from app.models.equipo_miembro import EquipoMiembro
from app.models.historial_avance import HistorialAvance
from app.models.historial_responsable import HistorialResponsable
from app.models.minuta import AcuerdoMinuta, Minuta
from app.models.nota import Nota
from app.models.notificacion import Notificacion
from app.models.pendiente import Pendiente
from app.models.reunion import Reunion, ReunionParticipante
from app.models.serie_reunion import SerieReunion, SerieReunionParticipante
from app.models.usuario import Usuario
from app.models.usuario_proyecto_rol import UsuarioProyectoRol

# Columnas simples: mover origen->destino sin riesgo de duplicado (no
# forman parte de ninguna restricción UNIQUE junto con otra columna).
_COLUMNAS_SIMPLES = [
    (Entregable, "responsable_id"),
    (Entregable, "creado_por"),
    (Reunion, "organizador_id"),
    (ReunionParticipante, "usuario_id"),
    (SerieReunion, "organizador_id"),
    (SerieReunionParticipante, "usuario_id"),
    (Minuta, "creado_por"),
    (AcuerdoMinuta, "responsable_id"),
    (HistorialAvance, "actualizado_por"),
    (HistorialResponsable, "usuario_id"),
    (Nota, "autor_id"),
    (Pendiente, "autor_id"),
    (AgendaItemRevision, "registrado_por"),
    (Notificacion, "usuario_id"),
    (UsuarioProyectoRol, "supervisor_id"),
]


def _mover_simples(db: Session, origen_id: int, destino_id: int) -> dict[str, int]:
    resumen = {}
    for modelo, columna in _COLUMNAS_SIMPLES:
        col = getattr(modelo, columna)
        n = db.query(modelo).filter(col == origen_id).update({columna: destino_id})
        if n:
            resumen[f"{modelo.__tablename__}.{columna}"] = n
    return resumen


def _fusionar_roles_proyecto(db: Session, origen_id: int, destino_id: int) -> dict[str, int]:
    """UsuarioProyectoRol.usuario_id es único junto con proyecto_id -- si
    destino YA tiene un rol en un tema donde origen también lo tiene, no
    se puede simplemente mover (violaría esa restricción): se conserva el
    rol de destino y se descarta el de origen para ese tema."""
    roles_origen = db.query(UsuarioProyectoRol).filter(UsuarioProyectoRol.usuario_id == origen_id).all()
    movidos = fusionados = 0
    for rol in roles_origen:
        ya_tiene = (
            db.query(UsuarioProyectoRol)
            .filter(
                UsuarioProyectoRol.usuario_id == destino_id,
                UsuarioProyectoRol.proyecto_id == rol.proyecto_id,
            )
            .first()
        )
        if ya_tiene:
            db.delete(rol)
            fusionados += 1
        else:
            rol.usuario_id = destino_id
            movidos += 1
    db.flush()
    resultado = {}
    if movidos:
        resultado["usuario_proyecto_rol.usuario_id (movidos)"] = movidos
    if fusionados:
        resultado["usuario_proyecto_rol.usuario_id (ya existían en destino, descartados)"] = fusionados
    return resultado


def _fusionar_equipo_miembro(db: Session, columna_mover: str, columna_pareja: str, origen_id: int, destino_id: int) -> dict[str, int]:
    """EquipoMiembro es único por (propietario_id, usuario_id) -- misma
    lógica que roles de proyecto, pero puede aplicar en cualquiera de los
    dos lados (origen como dueño del equipo, u origen como miembro del
    equipo de alguien más), por eso esta función se llama dos veces."""
    col_mover = getattr(EquipoMiembro, columna_mover)
    col_pareja = getattr(EquipoMiembro, columna_pareja)
    filas = db.query(EquipoMiembro).filter(col_mover == origen_id).all()
    movidos = fusionados = 0
    for fila in filas:
        valor_pareja = getattr(fila, columna_pareja)
        ya_existe = (
            db.query(EquipoMiembro)
            .filter(col_mover == destino_id, col_pareja == valor_pareja)
            .first()
        )
        if ya_existe:
            db.delete(fila)
            fusionados += 1
        else:
            setattr(fila, columna_mover, destino_id)
            movidos += 1
    db.flush()
    resultado = {}
    etiqueta = f"equipo_miembros.{columna_mover}"
    if movidos:
        resultado[f"{etiqueta} (movidos)"] = movidos
    if fusionados:
        resultado[f"{etiqueta} (ya existían en destino, descartados)"] = fusionados
    return resultado


# Duración corta a propósito (2026-09-17, "Ver como") -- distinta de
# settings.access_token_expire_minutes (login normal, 4h): esto es para
# una revisión puntual del superadmin, no una sesión de trabajo.
MINUTOS_TOKEN_VER_COMO = 30


def generar_token_ver_como(db: Session, admin: Usuario, usuario_id: int) -> tuple[str, Usuario]:
    """"Ver como" (2026-09-17, a petición de Yue: el sistema ya está en uso
    real, ya no puede simplemente loguearse como cualquiera porque la
    gente pudo cambiar su contraseña genérica) -- emite un token de
    acceso para `usuario_id` sin necesitar su contraseña. El caller
    (router) es responsable de auditar esta acción -- ver
    app/routers/admin.py, reusa el mismo Registro de auditoría que ya
    existe para el resto de acciones de superadmin, no hace falta una
    tabla nueva.

    Restringido a no-superadmins: impersonar a otro superadmin no aporta
    nada útil aquí (ambos ya tienen control total) y sí abre una confusión
    de privilegios innecesaria."""
    objetivo = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not objetivo:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Usuario no encontrado")
    if objetivo.id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ya eres tú mismo")
    if objetivo.es_super_admin:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No se puede 'ver como' otro superadmin")

    token = crear_access_token(
        data={"sub": str(objetivo.id), "ver_como_admin_id": admin.id},
        expires_delta=timedelta(minutes=MINUTOS_TOKEN_VER_COMO),
    )
    return token, objetivo


def reasignar_todo(db: Session, origen_id: int, destino_id: int) -> dict:
    if origen_id == destino_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Origen y destino deben ser personas distintas")

    origen = db.query(Usuario).filter(Usuario.id == origen_id).first()
    destino = db.query(Usuario).filter(Usuario.id == destino_id).first()
    if not origen or not destino:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Usuario origen o destino no encontrado")

    resumen = _mover_simples(db, origen_id, destino_id)
    resumen.update(_fusionar_roles_proyecto(db, origen_id, destino_id))
    resumen.update(_fusionar_equipo_miembro(db, "propietario_id", "usuario_id", origen_id, destino_id))
    resumen.update(_fusionar_equipo_miembro(db, "usuario_id", "propietario_id", origen_id, destino_id))

    db.commit()
    return {"origen": origen.nombre, "destino": destino.nombre, "movimientos": resumen}

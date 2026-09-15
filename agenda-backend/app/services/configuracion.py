"""
Configuración global editable en caliente (2026-09-07) -- ver
app/models/configuracion_app.py. Solo expone las claves en
`CLAVES_PERMITIDAS`: cualquier otra cosa (credenciales, URLs, llaves)
sigue siendo exclusiva de `.env`/Settings, nunca editable desde aquí.

CLAVES_PERMITIDAS quedó vacío desde el 2026-09-15 al descartar Twilio:
"whatsapp_proveedor" era el switch sms/ultramsg, y ahora WhatsApp siempre
es Ultramsg (ver app/services/whatsapp.py) -- no queda nada que elegir en
caliente. Se deja la función/estructura (obtener/establecer) para el
próximo ajuste configurable que se necesite, en vez de quitar el
mecanismo entero por una limpieza puntual.
"""
from sqlalchemy.orm import Session

from app.models.configuracion_app import ConfiguracionApp
from app.models.usuario import Usuario

# clave -> (valores válidos, valor por default si no hay override en DB)
CLAVES_PERMITIDAS: dict[str, tuple[list[str], object]] = {}


def obtener(db: Session, clave: str) -> str:
    """El valor guardado en DB, si existe, si no el default de Settings/.env
    -- así un despliegue que nunca tocó el panel se comporta exactamente
    como antes de que existiera esta tabla."""
    if clave not in CLAVES_PERMITIDAS:
        raise ValueError(f"Clave de configuración desconocida: {clave}")
    fila = db.query(ConfiguracionApp).filter(ConfiguracionApp.clave == clave).first()
    if fila:
        return fila.valor
    _, default_fn = CLAVES_PERMITIDAS[clave]
    return default_fn()


def obtener_todas(db: Session) -> dict[str, str]:
    return {clave: obtener(db, clave) for clave in CLAVES_PERMITIDAS}


def establecer(db: Session, actor: Usuario, clave: str, valor: str) -> str:
    if clave not in CLAVES_PERMITIDAS:
        raise ValueError(f"Clave de configuración desconocida: {clave}")
    valores_validos, _ = CLAVES_PERMITIDAS[clave]
    if valor not in valores_validos:
        raise ValueError(f'Valor inválido para "{clave}": debe ser uno de {valores_validos}')

    fila = db.query(ConfiguracionApp).filter(ConfiguracionApp.clave == clave).first()
    if fila:
        fila.valor = valor
        fila.actualizado_por = actor.id
    else:
        db.add(ConfiguracionApp(clave=clave, valor=valor, actualizado_por=actor.id))
    db.commit()
    return valor

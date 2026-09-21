"""
Configuración de la conexión a la base de datos (SQLAlchemy).
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from app.core.config import settings

engine = create_engine(
    settings.database_url,
    # 2026-09-21, bug real: el default de SQLAlchemy (pool_size=5,
    # max_overflow=10 -> 15 conexiones máximo) se agotó justo cuando el
    # túnel se cayó y volvió -- el navegador reintentó varias peticiones a
    # la vez y el pool no alcanzó, tumbando el calendario y otras vistas
    # con "QueuePool limit... connection timed out" hasta que se liberaron
    # solas. Subir el límite da margen para ráfagas así sin tocar nada más.
    # pool_pre_ping evita quedarse con una conexión muerta (ej. Postgres
    # se reinició) sin darse cuenta hasta que falla una query real.
    pool_size=20,
    max_overflow=20,
    pool_pre_ping=True,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Dependencia de FastAPI: entrega una sesión de BD y la cierra al terminar."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

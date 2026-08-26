"""
Punto de entrada de la Agenda Inteligente de Proyectos (API).

Para correr en desarrollo:
    uvicorn app.main:app --reload
"""
import asyncio

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.database import SessionLocal
from app.routers import (
    admin,
    asistente,
    auth,
    chatbot,
    dashboard,
    entregables,
    equipo_resumen,
    equipos,
    eventos_empresa,
    eventos_tiempo_real,
    minutas,
    notas,
    notificaciones,
    pendientes,
    proyectos,
    push,
    rendimiento,
    resumen,
    reuniones,
    series_reunion,
    usuarios,
)
from app.services.eventos_tiempo_real import registrar_hooks_sqlalchemy, registrar_loop
from app.services.materializar_series import materializar_ocurrencias
from app.services.recordatorios import (
    generar_recordatorios,
    generar_recordatorios_cumpleanos,
    generar_recordatorios_previos_reuniones,
    generar_recordatorios_reuniones_hoy,
)

# Registra el hook de SQLAlchemy que dispara un evento de tiempo real cada
# vez que se comitea una Notificacion nueva, sin importar desde qué
# función -- ver app/services/eventos_tiempo_real.py. Se hace al importar
# el módulo (no hace falta un loop corriendo todavía para esto).
registrar_hooks_sqlalchemy()

# El esquema ya no se crea/actualiza aquí -- desde el 2026-08-17 se maneja
# con Alembic (ver agenda-backend/migrations/), corrido explícitamente
# antes de reiniciar este contenedor (ver CLAUDE.md sección 4). Dejar
# `Base.metadata.create_all()` aquí competía con Alembic: al agregar un
# modelo nuevo, create_all lo creaba en silencio en el próximo arranque
# ANTES de que la migración correspondiente corriera, dejando el historial
# de Alembic desincronizado del estado real (encontrado de la forma dura
# al agregar las tablas de Fase 2/3 -- create_all ya las había creado por
# su cuenta cuando se generó la migración, que por eso solo detectó el
# ALTER TABLE de la columna nueva, no el CREATE TABLE de las 4 tablas).

app = FastAPI(
    title="Agenda Inteligente de Proyectos",
    description="API del MVP: entregables, roles por proyecto, avance e histórico, notificaciones.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Ajustar a dominios específicos antes de producción
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(usuarios.router)
app.include_router(proyectos.router)
app.include_router(entregables.router)
app.include_router(notificaciones.router)
app.include_router(resumen.router)
app.include_router(dashboard.router)
app.include_router(rendimiento.router)
app.include_router(reuniones.router)
app.include_router(equipos.router)
app.include_router(equipo_resumen.router)
app.include_router(minutas.router)
app.include_router(notas.router)
app.include_router(pendientes.router)
app.include_router(push.router)
app.include_router(eventos_empresa.router)
app.include_router(admin.router)
app.include_router(chatbot.router)
app.include_router(asistente.router)
app.include_router(series_reunion.router)
app.include_router(eventos_tiempo_real.router)
# app.include_router(integraciones.router)  # INACTIVO 2026-08-24, ver app/routers/integraciones.py


def _ejecutar_barrido_recordatorios():
    """Corre generar_recordatorios y generar_recordatorios_cumpleanos con su propia sesión de BD (para el scheduler)."""
    db = SessionLocal()
    try:
        generar_recordatorios(db)
        generar_recordatorios_cumpleanos(db)
        generar_recordatorios_reuniones_hoy(db)
        generar_recordatorios_previos_reuniones(db)
        materializar_ocurrencias(db)
    finally:
        db.close()


scheduler = BackgroundScheduler()
scheduler.add_job(
    _ejecutar_barrido_recordatorios,
    "interval",
    hours=settings.horas_entre_barridos_recordatorios,
    id="barrido_recordatorios",
)


@app.on_event("startup")
def iniciar_scheduler():
    # Corre un barrido inicial al arrancar y luego cada N horas (ver settings.horas_entre_barridos_recordatorios).
    _ejecutar_barrido_recordatorios()
    scheduler.start()


@app.on_event("startup")
async def iniciar_tiempo_real():
    # Necesita el event loop YA corriendo (por eso es un startup async,
    # a diferencia de iniciar_scheduler) -- ver
    # app/services/eventos_tiempo_real.py.
    registrar_loop(asyncio.get_running_loop())


@app.on_event("shutdown")
def detener_scheduler():
    scheduler.shutdown()


@app.get("/", tags=["Salud"])
def raiz():
    return {"status": "ok", "servicio": "agenda-inteligente-api"}

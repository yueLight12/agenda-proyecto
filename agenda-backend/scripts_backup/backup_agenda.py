"""
Backup diario de la base de datos real (agenda_nueva) -- 2026-09-25, a
petición de Yue tras una auditoría de seguridad que encontró que no
existía ninguna automatización de respaldo.

Qué hace:
1. Corre pg_dump contra agenda_nueva (lee la conexión de DATABASE_URL
   en .env, igual que el resto del backend).
2. Comprime y cifra el volcado en un .zip con contraseña (AES-256, vía
   pyzipper) -- son datos reales de la empresa subiendo a una carpeta de
   OneDrive personal, así que el archivo no debe quedar legible tal cual.
   La contraseña sale de BACKUP_ZIP_PASSWORD en .env (NUNCA se sube al
   repo, igual que las demás llaves) -- sin ella, el backup es
   irrecuperable, tenla guardada en un lugar seguro aparte del .env.
3. Guarda el .zip en BACKUP_CARPETA_DESTINO (.env) -- pensado para que
   sea una carpeta dentro de OneDrive, así el propio cliente de
   escritorio la sube solo, sin que este script maneje credenciales de
   ningún servicio en la nube.
4. Borra backups de más de BACKUP_DIAS_RETENCION días en esa carpeta
   (default 30).

Pensado para correr una vez al día vía el Programador de tareas de
Windows (ver docs/backups.md para el paso a paso de esa parte, que no
se puede automatizar desde aquí por ser un cambio a nivel del sistema
operativo, no del proyecto).

Uso manual (para probarlo/correrlo a mano):
    .venv\\Scripts\\python.exe scripts_backup\\backup_agenda.py
"""
import datetime
import logging
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlparse

import pyzipper
from dotenv import load_dotenv

RAIZ_BACKEND = Path(__file__).resolve().parent.parent
load_dotenv(RAIZ_BACKEND / ".env")

PG_DUMP_EXE = r"C:\Desarrollos\PostgreSQL16\bin\pg_dump.exe"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(RAIZ_BACKEND / "scripts_backup" / "backup_agenda.log", encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger("backup_agenda")


def _config_requerida(nombre: str) -> str:
    valor = os.environ.get(nombre)
    if not valor:
        raise SystemExit(f"Falta {nombre} en .env -- no se puede continuar sin esto.")
    return valor


def main() -> None:
    database_url = _config_requerida("DATABASE_URL")
    carpeta_destino = Path(_config_requerida("BACKUP_CARPETA_DESTINO"))
    password_zip = _config_requerida("BACKUP_ZIP_PASSWORD")
    dias_retencion = int(os.environ.get("BACKUP_DIAS_RETENCION", "30"))

    carpeta_destino.mkdir(parents=True, exist_ok=True)

    partes = urlparse(database_url)
    if partes.path.strip("/") != "agenda_nueva":
        # Candado explícito, mismo espíritu que el de scripts_pruebas/seed_jerarquia_prueba.py
        # -- este script solo debe respaldar la base real, nunca de pruebas por error.
        raise SystemExit(
            f"DATABASE_URL apunta a '{partes.path.strip('/')}', no a 'agenda_nueva' -- abortado por seguridad."
        )

    marca_tiempo = datetime.datetime.now().strftime("%Y-%m-%d_%H%M%S")
    nombre_zip = f"agenda_nueva_{marca_tiempo}.zip"
    ruta_zip = carpeta_destino / nombre_zip

    log.info("Iniciando backup de agenda_nueva -> %s", ruta_zip)

    with tempfile.TemporaryDirectory() as tmp:
        ruta_sql = Path(tmp) / f"agenda_nueva_{marca_tiempo}.sql"

        env = os.environ.copy()
        env["PGPASSWORD"] = partes.password or ""
        resultado = subprocess.run(
            [
                PG_DUMP_EXE,
                "-h", partes.hostname or "localhost",
                "-p", str(partes.port or 5432),
                "-U", partes.username or "postgres",
                "-d", "agenda_nueva",
                "-f", str(ruta_sql),
                "--no-owner",
            ],
            env=env,
            capture_output=True,
            text=True,
        )
        if resultado.returncode != 0:
            log.error("pg_dump falló: %s", resultado.stderr)
            raise SystemExit(1)

        with pyzipper.AESZipFile(
            ruta_zip, "w", compression=pyzipper.ZIP_LZMA, encryption=pyzipper.WZ_AES
        ) as zf:
            zf.setpassword(password_zip.encode("utf-8"))
            zf.write(ruta_sql, arcname=ruta_sql.name)

    tamano_mb = ruta_zip.stat().st_size / (1024 * 1024)
    log.info("Backup creado: %s (%.2f MB)", ruta_zip.name, tamano_mb)

    limite = datetime.datetime.now() - datetime.timedelta(days=dias_retencion)
    borrados = 0
    for archivo in carpeta_destino.glob("agenda_nueva_*.zip"):
        if datetime.datetime.fromtimestamp(archivo.stat().st_mtime) < limite:
            archivo.unlink()
            borrados += 1
    if borrados:
        log.info("Borrados %d backups con más de %d días.", borrados, dias_retencion)

    log.info("Backup completado sin errores.")


if __name__ == "__main__":
    main()

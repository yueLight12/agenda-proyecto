"""
Almacenamiento de archivos subidos por el usuario -- por ahora, solo
capturas de pantalla adjuntas a una Nota (ver app/models/nota.py,
app/services/notas.py). Implementación local en disco, dentro del volumen
ya montado del contenedor `api` (bind mount completo de agenda-backend/,
ver docker-compose.yml) -- así los archivos sobreviven a un rebuild sin
configuración extra, igual que ya pasa con el código.

Aislado detrás de estas funciones a propósito: el día de la migración a
AWS (ya prevista, ver CLAUDE.md sección 1), cambiar a S3 es un cambio
interno aquí, sin tocar ningún llamador.
"""
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile

DIRECTORIO_UPLOADS = Path(__file__).resolve().parent.parent.parent / "uploads"

# Solo imágenes -- esto es una captura de pantalla, no un almacén de
# archivos de propósito general. Tope de tamaño defensivo (el despliegue
# real corre en una Raspberry Pi con recursos limitados).
TIPOS_PERMITIDOS = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}
TAMANO_MAXIMO_BYTES = 5 * 1024 * 1024  # 5MB


async def guardar_imagen(archivo: UploadFile, subcarpeta: str) -> str:
    """Guarda una imagen subida y devuelve su ruta relativa a
    DIRECTORIO_UPLOADS (lo que se guarda en la columna imagen_path del
    modelo que la referencia). Valida tipo y tamaño."""
    if archivo.content_type not in TIPOS_PERMITIDOS:
        raise HTTPException(
            status_code=400, detail="Solo se aceptan imágenes (PNG, JPG o WEBP)."
        )
    contenido = await archivo.read()
    if len(contenido) > TAMANO_MAXIMO_BYTES:
        raise HTTPException(status_code=400, detail="La imagen no puede pesar más de 5MB.")

    carpeta = DIRECTORIO_UPLOADS / subcarpeta
    carpeta.mkdir(parents=True, exist_ok=True)
    nombre = f"{uuid.uuid4().hex}{TIPOS_PERMITIDOS[archivo.content_type]}"
    (carpeta / nombre).write_bytes(contenido)
    return f"{subcarpeta}/{nombre}"


def ruta_absoluta(ruta_relativa: str) -> Path:
    return DIRECTORIO_UPLOADS / ruta_relativa


def eliminar_imagen(ruta_relativa: str | None) -> None:
    """No truena si el archivo ya no existe -- borrar una nota cuya imagen
    se perdió por fuera del flujo normal no debe bloquear el borrado."""
    if not ruta_relativa:
        return
    ruta = ruta_absoluta(ruta_relativa)
    if ruta.exists():
        ruta.unlink()

"""
Síntesis de voz neuronal para el asistente "Chambeador" (2026-09-28, Fase 4
del plan de fluidez -- ver CLAUDE.md sección 6). Usa Piper (TTS local,
sin salir a internet, ver https://github.com/rhasspy/piper) en vez de la
voz nativa SpeechSynthesisUtterance del navegador.

Los modelos (.onnx) NO viven en el repo (son binarios de ~60-110MB cada
uno) -- se descargan aparte con `python -m piper.download_voices <id>
--download-dir <carpeta>` y la carpeta se apunta vía PIPER_VOCES_DIR en
.env. Si esa variable está vacía, esta función lanza VozNeuralNoDisponible
y el router responde 503 -- el frontend cae solo a la voz del navegador,
sin romper nada (mismo patrón que SMTP/VAPID/SAML opcionales).
"""
import io
import wave
from pathlib import Path

from app.core.config import settings

# Catálogo de voces habilitadas -- deliberadamente acotado a las 2 que Yue
# probó y aprobó (2026-09-28), de las ~9 voces en español que ofrece Piper.
# Mismo id que usa el selector del frontend y PreferenciaUsuario.voz_asistente.
VOCES_DISPONIBLES = {
    "es_MX-claude-high": "es_MX-claude-high.onnx",
    "es_AR-daniela-high": "es_AR-daniela-high.onnx",
}

# Los modelos son pesados de cargar (~1-2s) pero sintetizan rápido una vez
# en memoria (~0.3s por frase, medido en la laptop de desarrollo) -- se
# cargan una sola vez por proceso y se reusan, en vez de recargar en cada
# request.
_modelos_cargados: dict[str, object] = {}


class VozNeuralNoDisponible(Exception):
    """PIPER_VOCES_DIR vacío, o los archivos de la voz no están en disco."""


def _cargar_voz(voz: str):
    if voz not in VOCES_DISPONIBLES:
        raise ValueError(f"Voz desconocida: {voz!r}. Válidas: {list(VOCES_DISPONIBLES)}")
    if voz in _modelos_cargados:
        return _modelos_cargados[voz]
    if not settings.piper_voces_dir:
        raise VozNeuralNoDisponible("PIPER_VOCES_DIR no está configurado")

    from piper import PiperVoice  # import perezoso: piper-tts es pesado (onnxruntime)

    ruta = Path(settings.piper_voces_dir) / VOCES_DISPONIBLES[voz]
    if not ruta.exists():
        raise VozNeuralNoDisponible(f"No se encontró el modelo de voz en {ruta}")

    modelo = PiperVoice.load(str(ruta))
    _modelos_cargados[voz] = modelo
    return modelo


def sintetizar_wav(texto: str, voz: str) -> bytes:
    """Genera audio WAV (bytes) para `texto` con la voz Piper indicada."""
    modelo = _cargar_voz(voz)
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        modelo.synthesize_wav(texto, wav_file)
    return buffer.getvalue()

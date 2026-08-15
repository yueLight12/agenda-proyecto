"""
Configuración central de la aplicación.
Lee las variables de entorno desde el archivo .env (ver .env.example).
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql://postgres:postgres@localhost:5432/agenda_inteligente"

    secret_key: str = "dev-secret-key-cambiar-en-produccion"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 480

    dias_alerta_entregable: int = 2
    horas_entre_barridos_recordatorios: int = 6

    # Chatbot de consulta (LLM local vía Ollama, sin salir a internet)
    ollama_url: str = "http://host.docker.internal:11434"
    ollama_modelo: str = "mistral:7b-instruct-q4_0"

    # Asistente de voz: transcripción con Whisper (corre DENTRO de Docker,
    # a diferencia de Ollama que corre en la máquina host — ver docker-compose.yml)
    whisper_url: str = "http://whisper:9000"

    # Motor de interpretación del asistente de voz: "ollama" (default, 100%
    # local, para producción con datos reales) o "gemini" (solo para probar
    # el diseño del catálogo de tools con frases de prueba — NUNCA con datos
    # reales de clientes, ver CLAUDE.md sección 6, Milestone C).
    asistente_llm_proveedor: str = "ollama"
    gemini_api_key: str = ""
    gemini_modelo: str = "gemini-flash-latest"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()

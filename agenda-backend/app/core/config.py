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
    # o "claude" (API de Anthropic — mejor tool-calling/JSON estructurado que
    # Gemini, tampoco es local, se le aplica la misma seudonimización).
    asistente_llm_proveedor: str = "ollama"
    gemini_api_key: str = ""
    gemini_modelo: str = "gemini-flash-latest"
    claude_api_key: str = ""
    claude_modelo: str = "claude-opus-5"

    # Correo de aviso "nunca has entrado al sistema" (2026-08-21, a
    # petición de Yue: obligar a que todos en la organización usen la
    # app) -- vía SMTP de Outlook/Office 365, con la cuenta real de la
    # empresa. Si smtp_usuario/smtp_password quedan vacíos (default), el
    # envío se simula (se registra en el log) en vez de fallar -- así el
    # resto del sistema no depende de tener ya la cuenta remitente
    # configurada. Ver app/services/email_cliente.py.
    smtp_host: str = "smtp.office365.com"
    smtp_puerto: int = 587
    smtp_usuario: str = ""
    smtp_password: str = ""
    smtp_nombre_remitente: str = "Agenda Inteligente"
    # URL donde la persona entra a usar el sistema (web) -- se incluye en
    # el correo de aviso. Sin valor real todavía, hay que configurarlo
    # cuando se decida la URL pública definitiva.
    url_app: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()

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
    # app) -- vía SMTP. Producción usará Outlook/Office 365 (pendiente de
    # permisos de TI); el demo usa una cuenta de Gmail con contraseña de
    # aplicación mientras tanto (ver .env.example). Si smtp_usuario/
    # smtp_password quedan vacíos (default), el envío se simula (se
    # registra en el log) en vez de fallar -- así el resto del sistema no
    # depende de tener ya la cuenta remitente configurada.
    # Ver app/services/email_cliente.py.
    smtp_host: str = "smtp.gmail.com"
    smtp_puerto: int = 587
    smtp_usuario: str = ""
    smtp_password: str = ""
    smtp_nombre_remitente: str = "Agenda Inteligente"

    # INACTIVO desde 2026-08-24: envío de correo vía Power Automate Cloud,
    # pensado para mandar desde el Outlook corporativo sin permisos de TI.
    # El conector Office 365 Outlook de Power Automate falló al conectar
    # ("Failed to create OAuth connection") -- bloqueado por política de
    # la organización, pendiente de que TI lo habilite. Se deja la
    # variable y el código comentado en app/services/email_cliente.py.
    # power_automate_webhook_url_correo: str = ""

    # INACTIVO desde 2026-08-24: envío vía Power Automate Desktop (Outlook
    # de escritorio + bandeja de salida en la BD). Pausado por un problema
    # de Outlook de escritorio en la laptop de Yue antes de terminar la
    # prueba. Esta clave sería la que el flujo de escritorio manda en el
    # header X-Api-Key -- ver app/routers/integraciones.py.
    # integracion_correo_api_key: str = ""

    # URL donde la persona entra a usar el sistema (web) -- se incluye en
    # el correo de aviso. Sin valor real todavía, hay que configurarlo
    # cuando se decida la URL pública definitiva.
    url_app: str = ""

    # Notificaciones push del navegador (Web Push, VAPID) para entregables
    # urgentes -- 2026-08-23, a petición de Yue: avisar aunque el celular
    # esté con la pantalla apagada o la app cerrada, no solo con la
    # notificación in-app. Par de llaves propio del proyecto (NO de un
    # proveedor externo) -- se genera una sola vez con
    # `vapid --gen` (paquete py-vapid) y no cambia después; si queda
    # vacío, el envío se simula (mismo patrón que SMTP_USUARIO/PASSWORD).
    # Ver app/services/push.py.
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    # Correo de contacto exigido por el estándar Web Push (va en el header
    # `sub` del JWT VAPID) -- no se le manda nada, es solo para que el
    # navegador/proveedor push tenga a quién contactar si hay abuso.
    vapid_contact_email: str = ""

    # Notificaciones por WhatsApp para entregables urgentes (2026-08-24, a
    # petición de Yue: alcanzar también a quienes hoy usan WhatsApp y no
    # instalan la app). DEMO vía Twilio WhatsApp Sandbox -- NO es la
    # WhatsApp Business API definitiva, que requiere permisos de TI
    # pendientes (ver CLAUDE.md sección 6). Mismo patrón que
    # SMTP_USUARIO/VAPID_*: si faltan credenciales, el envío se SIMULA
    # (se registra en el log) en vez de fallar. Ver app/services/whatsapp.py.
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    # Número sandbox de Twilio, con el prefijo "whatsapp:" que exige su API,
    # ej. "whatsapp:+14155238886" (el mismo para todos los clientes en
    # sandbox -- cada destinatario debe unirse una vez con su código "join").
    twilio_whatsapp_from: str = ""
    # Número de Twilio para SMS (2026-09-01, a petición de Yue: para una demo
    # ante gente de alto perfil, el "join" del sandbox de WhatsApp no es
    # viable -- SMS con este número no lo requiere). Sin el prefijo
    # "whatsapp:", ej. "+14155551234". Ver enviar_whatsapp en
    # app/services/whatsapp.py, que ahora manda por SMS con este número en
    # vez de WhatsApp con twilio_whatsapp_from. Si la cuenta Twilio sigue en
    # trial, cada número destino debe verificarse antes en la consola de
    # Twilio (Verified Caller IDs) -- eso no aplica una vez que la cuenta
    # tenga saldo pagado.
    twilio_sms_from: str = ""

    # Ultramsg (2026-09-02, a petición de Yue) -- SOLO para una demo puntual
    # ante gente de alto perfil que necesita ver el mensaje llegar por
    # WhatsApp de verdad (no SMS, ver twilio_sms_from arriba), sin pedirle a
    # nadie que mande "join" antes. Ultramsg NO es la API oficial de
    # WhatsApp Business -- automatiza WhatsApp Web (login por QR desde un
    # teléfono), va contra los términos de servicio de WhatsApp y el número
    # se puede bloquear sin aviso con uso real/sostenido. Aceptado
    # EXPLÍCITAMENTE por Yue como solución desechable solo para la demo,
    # con el plan de reemplazarla por WhatsApp Business real (ver CLAUDE.md)
    # antes de cualquier uso en un entorno de trabajo real. Ver
    # whatsapp_proveedor abajo para el switch, y app/services/whatsapp.py.
    ultramsg_instance_id: str = ""
    ultramsg_token: str = ""
    # Ultramsg NO tiene firma de petición como Twilio (X-Twilio-Signature) --
    # sin esto, cualquiera que adivine la URL del webhook podría mandar
    # "LISTO #id" falsos. Como defensa mínima, el segmento del path debe
    # coincidir con este valor (URL no listada públicamente + secreto en el
    # path). Genera algo random y ponlo también al configurar webhook_url
    # en Ultramsg, ej. ".../webhooks/ultramsg/<esto>".
    ultramsg_webhook_secreto: str = ""

    # Switch de canal para enviar_whatsapp (2026-09-02): "sms" (default, el
    # fix de producción del 2026-09-01, sin fricción y sin riesgo) o
    # "ultramsg" (WhatsApp real, solo para la demo puntual de arriba --
    # cambiar de vuelta a "sms" en cuanto termine la demo).
    whatsapp_proveedor: str = "sms"

    # Asignar tareas por WhatsApp (2026-08-27, a petición de Yue: puente de
    # transición para quien ya vive en WhatsApp -- no reemplaza la app,
    # solo evita el salto brusco). Piloto DELIBERADAMENTE acotado a un
    # número (Bernardo) y una sola acción (crear_entregable) -- ver
    # app/routers/whatsapp_webhook.py. Lista separada por comas de números
    # en formato internacional (ej. "+525512345678,+525587654321") -- vacío
    # = nadie puede usar el canal todavía (falla cerrado, no abierto).
    whatsapp_asignador_tareas_telefonos: str = ""

    # URL pública exacta del webhook (ej.
    # "https://agenda-demo.usw3.devtunnels.ms/webhooks/whatsapp"), tal como
    # quedó configurada en la consola de Twilio -- la validación de firma
    # (RequestValidator) exige comparar contra la MISMA URL que Twilio usó
    # para firmar, y `request.url` dentro del contenedor puede no coincidir
    # si el túnel no reenvía el Host original. Vacío = usar request.url tal
    # cual (sirve si el túnel sí preserva el Host).
    whatsapp_webhook_url_publica: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()

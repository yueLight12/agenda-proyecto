"""
Configuración central de la aplicación.
Lee las variables de entorno desde el archivo .env (ver .env.example).
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql://postgres:postgres@localhost:5432/agenda_inteligente"

    secret_key: str = "dev-secret-key-cambiar-en-produccion"
    algorithm: str = "HS256"
    # Bajado de 480 (8h) a 240 (4h) el 2026-09-15, a petición de Yue --
    # pensando en el piloto expuesto públicamente a 20-30 personas: si se
    # pierde/comparte un dispositivo con sesión abierta, la ventana de
    # riesgo se reduce a la mitad. Sigue alcanzando para media jornada sin
    # tener que volver a iniciar sesión.
    access_token_expire_minutes: int = 240

    dias_alerta_entregable: int = 2
    horas_entre_barridos_recordatorios: int = 6
    # Recordatorio de refuerzo para entregables urgentes que vencen HOY
    # (2026-09-14, a petición de Yue: si a alguien no le funcionó el único
    # aviso normal -- ignoró la app, el push y el WhatsApp -- y la tarea
    # sigue sin resolverse el mismo día que vence, hay que insistir con más
    # frecuencia en vez de esperar al barrido normal del día siguiente). Ver
    # generar_recordatorios_urgentes_hoy en app/services/recordatorios.py.
    horas_entre_recordatorios_urgentes: int = 2

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

    # CORS (2026-09-15, a petición de Yue): orígenes ADICIONALES a url_app
    # (arriba) y los puertos de desarrollo local (ver main.py) desde donde
    # el navegador puede llamar a esta API -- separados por comas, ej.
    # "https://otro-dominio.mx,https://algo-mas.mx". Antes esto era "*"
    # (cualquier origen) -- funcionaba, pero es la config más permisiva
    # posible: cualquier sitio web podía llamar a la API desde el
    # navegador de alguien con sesión abierta. Vacío = solo url_app + los
    # puertos locales de siempre.
    cors_origenes_extra: str = ""

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
    # instalan la app), vía Ultramsg (2026-09-02). Twilio (WhatsApp Sandbox,
    # luego SMS) se usó primero y se descartó del todo el 2026-09-15, ya con
    # Ultramsg validado como canal único -- ver app/services/whatsapp.py.
    # Ultramsg NO es la API oficial de WhatsApp Business -- automatiza
    # WhatsApp Web (login por QR desde un teléfono), va contra los términos
    # de servicio de WhatsApp y el número se puede bloquear sin aviso con
    # uso real/sostenido. Aceptado EXPLÍCITAMENTE por Yue mientras se
    # resuelve WhatsApp Business real (ver CLAUDE.md). Si faltan
    # credenciales, el envío se SIMULA (se registra en el log) en vez de
    # fallar, mismo patrón que SMTP_USUARIO/VAPID_*.
    ultramsg_instance_id: str = ""
    ultramsg_token: str = ""
    # Ultramsg NO tiene firma de petición como Twilio (X-Twilio-Signature) --
    # sin esto, cualquiera que adivine la URL del webhook podría mandar
    # "LISTO #id" falsos. Como defensa mínima, el segmento del path debe
    # coincidir con este valor (URL no listada públicamente + secreto en el
    # path). Genera algo random y ponlo también al configurar webhook_url
    # en Ultramsg, ej. ".../webhooks/ultramsg/<esto>".
    ultramsg_webhook_secreto: str = ""

    # Asignar tareas por WhatsApp (2026-08-27, a petición de Yue: puente de
    # transición para quien ya vive en WhatsApp -- no reemplaza la app,
    # solo evita el salto brusco). Piloto DELIBERADAMENTE acotado a un
    # número (Bernardo) y una sola acción (crear_entregable) -- ver
    # app/routers/whatsapp_webhook.py. Lista separada por comas de números
    # en formato internacional (ej. "+525512345678,+525587654321") -- vacío
    # = nadie puede usar el canal todavía (falla cerrado, no abierto).
    whatsapp_asignador_tareas_telefonos: str = ""
    # Login corporativo vía SAML 2.0 (2026-09-15, a petición de Yue) --
    # NO reemplaza el login por email/contraseña, se agrega como una
    # segunda puerta de entrada opcional (ver app/routers/saml_sso.py). Se
    # construyó ANTES de tener el certificado real firmado por el proceso
    # interno de certificación de la organización (CyAAL/DataSec) -- con
    # todo vacío (default), el feature completo se desactiva solo (los
    # endpoints /saml/* devuelven 503 "SSO no configurado") sin afectar en
    # nada el login normal, mismo patrón que SMTP_USUARIO/VAPID_*/
    # ULTRAMSG_*. Para pruebas de la mecánica SAML en sí (firma, mapeo de
    # usuario) sin depender del trámite real, se puede usar un certificado
    # autofirmado propio o una cuenta gratuita de desarrollador de Okta --
    # cuando llegue el certificado real, solo se reemplazan estos valores,
    # el código no cambia.
    saml_sp_entity_id: str = ""
    # Debe coincidir exactamente con la URL pública real (ver
    # WHATSAPP_WEBHOOK_URL_PUBLICA para el mismo tipo de gotcha con
    # túneles/proxies que no preservan el Host original).
    saml_sp_acs_url: str = ""
    # Llave privada y certificado PROPIOS de esta app (el par que arma
    # okta_prod.key/.pfx en el proceso de certificación) -- rutas a
    # archivo, NO el contenido inline (son PEM largos). Usados para firmar
    # las peticiones salientes, si el IdP lo exige.
    saml_sp_key_path: str = ""
    saml_sp_cert_path: str = ""
    # Datos del lado del Identity Provider (Okta), entregados por quien
    # administra el tenant al dar de alta esta app.
    saml_idp_entity_id: str = ""
    saml_idp_sso_url: str = ""
    saml_idp_cert_path: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()

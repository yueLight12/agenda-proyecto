# Agenda Inteligente de Proyectos — Backend (Fase 1)

API en FastAPI del MVP, ya ampliado más allá del alcance original.
Implementa: usuarios, proyectos, roles por proyecto (N1-N4), entregables
con histórico de avance, notificaciones in-app (incluyendo aviso al
supervisor en cada actualización de avance, no solo al completarse),
resumen ejecutivo y dashboard agregado multi-proyecto, reuniones, minutas
con acuerdos (convertibles en entregables reales), "mi equipo" (plantilla
de personas+rol reutilizable entre proyectos), y un chatbot de consulta
sobre un LLM local — todo con las reglas de visibilidad definidas en el
documento de diseño de Fase 0 (y sus extensiones, ver `CLAUDE.md`).

## Estructura del proyecto

```
app/
├── main.py                  # Punto de entrada, arma la app y registra routers
├── database.py               # Conexión SQLAlchemy
├── dependencies.py           # Obtener usuario autenticado desde el JWT
├── core/
│   ├── config.py              # Variables de entorno
│   ├── security.py            # Hash de password + JWT
│   └── permissions.py         # *** Reglas de visibilidad centralizadas ***
├── models/                   # Modelos SQLAlchemy (tablas)
├── schemas/                  # Esquemas Pydantic (validación entrada/salida)
├── routers/                  # Endpoints agrupados por recurso
└── services/
    ├── recordatorios.py       # Lógica de generación de notificaciones
    └── chatbot.py             # Arma contexto (respeta permisos) + llama al LLM local
seed.py                      # Script para cargar datos de prueba (demo)
seed_usuarios_reales.py      # Alta de usuarios reales del cliente, sin proyectos/roles
reset_passwords_reales.py    # Resetea password temporal de los usuarios reales
```

## Cómo correrlo localmente (sin Docker)

1. Crear entorno virtual e instalar dependencias:
   ```bash
   python -m venv venv
   source venv/bin/activate   # En Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

2. Copiar `.env.example` a `.env` y ajustar `DATABASE_URL` (requiere PostgreSQL
   corriendo localmente, o usar Docker — ver abajo).

3. Levantar el servidor:
   ```bash
   uvicorn app.main:app --reload
   ```
   Al arrancar, crea las tablas automáticamente si no existen.

4. (Opcional) Cargar datos de prueba — 7 usuarios y 4 proyectos:
   ```bash
   python seed.py
   ```
   Esto imprime la lista de correos de prueba y la contraseña (`Demo1234!`
   para todos).

5. Documentación interactiva de la API (Swagger):
   http://localhost:8000/docs

## Cómo correrlo con Docker (recomendado para no instalar Postgres local)

```bash
docker compose up --build
```

Esto levanta la API en `http://localhost:8000` y una base de datos
PostgreSQL. Luego, para cargar datos de prueba dentro del contenedor:

```bash
docker compose exec api python seed.py
```

## Probar el flujo básico (con curl o /docs)

1. `POST /auth/login` con `username=n1@demo.com` y `password=Demo1234!`
   (form-data, como pide OAuth2PasswordRequestForm) → devuelve `access_token`.
2. Usar ese token como `Bearer` en el resto de los endpoints.
3. `GET /proyectos` → lista los proyectos donde ese usuario tiene rol.
4. `GET /proyectos/{id}/entregables` → lista filtrada según su rol.
5. `POST /auth/cambiar-password` → el usuario autenticado cambia su propia
   contraseña (pide `password_actual` + `password_nueva`, mínimo 8
   caracteres). Ya tiene su modal en el frontend (ícono de usuario en el
   sidebar → "Cambiar contraseña").
6. `POST /admin/generar-recordatorios` → dispara el barrido de recordatorios
   manualmente (útil para pruebas puntuales). En condiciones normales no hace
   falta: la API corre este mismo barrido sola al arrancar y luego cada
   `HORAS_ENTRE_BARRIDOS_RECORDATORIOS` horas (default 6, ver `.env.example`),
   usando `APScheduler` (`app/main.py`).

## Alta de usuarios reales y reseteo de contraseña

Para cargar el equipo real del cliente (sin datos de prueba ni proyectos
demo):

```bash
docker compose exec api python seed_usuarios_reales.py
```

Es idempotente: si un email ya existe, no lo toca (no pisa su contraseña).
Genera una contraseña temporal aleatoria por usuario nuevo y **solo la
imprime una vez en la terminal** — no queda guardada en ningún lado, así que
hay que copiarla en el momento. Cada quien puede cambiarla después desde la
app (`POST /auth/cambiar-password`, ver arriba).

Si esas contraseñas se perdieron (nadie copió la salida) y hace falta
generar unas nuevas para poder entrar:

```bash
docker compose exec api python reset_passwords_reales.py
```

Actualiza el hash en la base para la lista de emails que trae el script
(hoy hardcodeada ahí mismo — si cambia el equipo, hay que editar esa lista).
A diferencia de `seed_usuarios_reales.py`, esta vez la salida además queda
guardada en `agenda-backend/credenciales_reseteo.txt` (ignorado por git) para
no perderla de nuevo.

## Chatbot de consulta (LLM local, sin salir a internet)

`POST /chatbot/consulta` recibe una pregunta en lenguaje natural y responde
usando **solo** los datos que el usuario que pregunta ya puede ver (arma el
contexto con `query_entregables_visibles`, la misma función de permisos que
usa todo lo demás). El texto se le pasa a un modelo de lenguaje que corre
**localmente vía Ollama**, fuera de Docker, en la máquina host — no hay
ninguna llamada a una API externa. Esto es a propósito: el cliente tiene un
firewall corporativo que bloquea salidas a internet, así que este enfoque
permite hacer la demo dentro de su red sin depender de que abran una
excepción.

Configuración (`.env`, ver `.env.example`):
- `OLLAMA_URL` — por defecto `http://host.docker.internal:11434` (así el
  contenedor de la API llega al Ollama que corre en la máquina host).
- `OLLAMA_MODELO` — por defecto `mistral:7b-instruct-q4_0` (cabe en 6GB de
  VRAM con aceleración GPU; otros modelos probados: `llama3.2:3b`, `phi3`).

Requiere tener [Ollama](https://ollama.com) instalado y corriendo en la
máquina host, con el modelo ya descargado (`ollama pull mistral:7b-instruct-q4_0`).

El modelo **nunca** decide qué es visible ni toca la base de datos — solo
redacta la respuesta en español sobre el bloque de datos que el backend ya
filtró. El mismo patrón (función de servicio con permisos → resultado) es
la base para cuando se construya, en una fase futura, un chatbot con
capacidad de ejecutar acciones (no iniciar sin aprobación explícita).

## Reglas de visibilidad implementadas (resumen)

Ver `app/core/permissions.py`, función `query_entregables_visibles`:

- **N1**: ve todos los entregables del proyecto.
- **N2**: ve los entregables de su equipo (usuarios que supervisa en ese
  proyecto) + los propios, incluyendo sensibles de su equipo.
- **N3 / N4**: ve solo sus propios entregables + los no sensibles del
  proyecto.

## Pendiente para siguientes fases (ya identificado, no se pierde de vista)

- **Fase 4 (lo único pendiente del roadmap original)**: cargar datos reales
  del cliente (ver "Alta de usuarios reales" arriba) y hacer la demo formal.
- **Siguiente entregable aprobado**: un asistente de voz que ejecuta
  acciones reales (agendar reuniones, crear entregables, etc. por dictado),
  con reconocimiento de voz local y confirmación obligatoria antes de
  ejecutar — arquitectura definida, aún sin construir (ver `CLAUDE.md`
  sección 6, Milestone B de la app móvil).
- Fase futura, sin aprobar: notificaciones por correo/WhatsApp (la tabla
  `notificaciones` y `recordatorios.py` ya están listos para conectarse a
  un canal externo sin cambiar la lógica de negocio), minutas con
  transcripción/IA (las minutas manuales ya existen, ver arriba).

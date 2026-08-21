# Agenda Plan B (Agenda Inteligente de Proyectos)

Pantalla única de agenda/entregables — evolución del MVP original
(`agenda-proyecto`, que sigue existiendo intacto como respaldo). Ver
`CLAUDE.md` para las reglas de trabajo y el historial completo de decisiones.

## Requisitos

- Docker Desktop (con WSL2 si estás en Windows).
- Una API key de Claude (o Gemini) si quieres que el asistente de voz/chatbot
  funcione — pídesela a quien te compartió el repo. Sin ella, el resto del
  sistema funciona igual.

## Levantar todo con un solo comando

Usa `docker-compose.dev-local.yml` — **no** `docker-compose.nueva.yml`
(ese es el que usa la Pi para producción real, apunta por red compartida a
contenedores que solo existen ahí; usarlo en otra máquina no levanta nada
útil, y usarlo por error contra la Pi puede desconectar producción de su
base de datos real, como ya pasó una vez).

Este stack (`dev-local`) es **autocontenido**: trae su propio PostgreSQL y
su propio Whisper (transcripción de voz), no depende de ningún otro
proyecto ni contenedor externo.

1. Clona el repo y entra a la rama `nueva-version`:
   ```bash
   git clone https://github.com/yueLight12/agenda-proyecto.git
   cd agenda-proyecto
   git checkout nueva-version
   ```
2. Copia las plantillas de variables de entorno:
   ```bash
   cp .env.example .env
   cp agenda-backend/.env.example agenda-backend/.env
   ```
   Abre `agenda-backend/.env` y pega tu propia API key (`CLAUDE_API_KEY` o
   `GEMINI_API_KEY`, según cuál uses) — **nunca la de producción**.
3. Levanta primero la base de datos y espera a que esté lista:
   ```bash
   docker compose -f docker-compose.dev-local.yml up -d db whisper
   ```
4. Aplica las migraciones **antes** de levantar la API — el arranque de la
   API corre un barrido de recordatorios que consulta tablas reales, así
   que si la API arranca contra una base sin migrar, se cae en un loop de
   reinicios:
   ```bash
   docker compose -f docker-compose.dev-local.yml build api
   docker compose -f docker-compose.dev-local.yml run --rm api alembic upgrade head
   ```
5. Carga datos de prueba (primera vez):
   ```bash
   docker compose -f docker-compose.dev-local.yml run --rm api python seed.py
   ```
   Imprime los correos de prueba (contraseña `Demo1234!` para todos).
6. Ahora sí, levanta todo:
   ```bash
   docker compose -f docker-compose.dev-local.yml up -d
   ```
   Esto deja corriendo:
   - PostgreSQL en `localhost:5452` (base `agenda_nueva`)
   - Whisper (transcripción de voz) en `localhost:8013`
   - API en `http://localhost:8011` (documentación interactiva en `/docs`)
   - Frontend en `http://localhost:5184`

   Entra a `http://localhost:5184` con cualquiera de los correos de prueba.

## Notas importantes

- **El contenedor `web` NO tiene hot-reload** — sirve una build de
  producción (`vite build` + `vite preview`), igual que en la Pi. Si editas
  el frontend y quieres verlo reflejado en Docker, reconstruye:
  ```bash
  docker compose -f docker-compose.dev-local.yml up -d --build web
  ```
  Para desarrollar con hot-reload de verdad, corre `npm run dev` localmente
  (ver `agenda-frontend/README.md`) apuntando `VITE_API_URL` a
  `http://localhost:8011`.
- **El contenedor `api` sí tiene hot-reload** (uvicorn `--reload` + volumen
  montado) — los cambios en `agenda-backend/` se reflejan solos.
- **Esquema de base de datos: Alembic, no `create_all`** — cualquier cambio
  de modelo requiere una migración nueva (`alembic revision --autogenerate
  -m "..."` dentro del contenedor `api`, luego `alembic upgrade head`).
  La migración baseline (`65cc6ae752b0`) ya crea el esquema completo desde
  cero — se verificó corriendo `alembic upgrade head` contra una base
  vacía real (2026-08-20). `autogenerate` no siempre detecta bien índices
  únicos parciales (`postgresql_where`) ni cambios en el cuerpo de un
  `CheckConstraint` ya existente — revisa el diff generado antes de
  confiar en él ciegamente, como ya pasó dos veces en el historial de este
  proyecto (ver comentarios en `agenda-backend/migrations/versions/`).
- Puertos y nombre de base de datos (`5452`/`8013`/`8011`/`5184`,
  `agenda_nueva`) se eligieron a propósito distintos a los del proyecto
  original (`agenda-proyecto`, que usa `5442`/`8012`/`8010`/`5183`) para que
  ambos stacks puedan coexistir en la misma máquina sin chocar — aunque en
  una máquina nueva normalmente solo vas a tener este.
- `agenda-backend/.env` y la raíz `.env` **no se versionan** (ver
  `.gitignore`) — cada quien tiene el suyo con su propia API key.

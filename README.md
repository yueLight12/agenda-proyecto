# Agenda Inteligente de Proyectos

MVP del sistema de seguimiento de entregables, avances y roles por proyecto.
Ver `docs/diseno-fase0-agenda-inteligente.md` para el diseño completo, y
`CLAUDE.md` para las instrucciones que debe seguir Claude Code al trabajar
aquí.

## Estructura

```
agenda-backend/     API (FastAPI + PostgreSQL) — ver agenda-backend/README.md
agenda-frontend/    App web (React + Vite) — ver agenda-frontend/README.md
docs/                Documento de diseño de Fase 0
CLAUDE.md            Instrucciones de trabajo para Claude Code
```

## Cómo abrir esto en VS Code

1. Descomprime el zip en la carpeta donde trabajas tus proyectos.
2. Abre esa carpeta (`agenda-proyecto/`, la carpeta raíz) en VS Code —
   ábrela completa, no solo `agenda-backend` o `agenda-frontend` por
   separado, así Claude Code ve todo el contexto y el `CLAUDE.md`.
3. Abre Claude Code dentro de VS Code. Al iniciar, léele o pídele que lea
   `CLAUDE.md` primero si no lo hace automáticamente (algunas versiones lo
   detectan solas al estar en la raíz del proyecto).

## Cómo levantar todo con un solo comando (recomendado)

Necesitas Docker Desktop instalado y corriendo. Desde la carpeta raíz:

```bash
docker compose up --build
```

Esto levanta:
- PostgreSQL en `localhost:5442`
- API en `http://localhost:8010` (documentación interactiva en `/docs`)
- Frontend en `http://localhost:5183`

(Puertos remapeados en el `docker-compose.yml` de la raíz para no chocar con
otros proyectos corriendo en la misma máquina. Si corres el backend o el
frontend por separado con el `docker-compose.yml` que trae cada carpeta,
esos sí usan los puertos por defecto: `8000` y `5173` respectivamente — ver
sección "Cómo correrlo sin Docker" más abajo.)

### Importante: el contenedor `web` sirve una build de producción, no dev-mode

El `Dockerfile` de `agenda-frontend` corre `npm run build` y sirve el
resultado con `vite preview` (no `vite dev`). Esto se hizo así porque el
proyecto se comparte con el cliente vía un túnel público (ver sección
siguiente) y en modo dev cada módulo viaja como archivo separado, lo que con
la latencia de un túnel hace la carga muy lenta. La contra: **no hay
hot-reload dentro de Docker** — si editás el frontend, el contenedor no se
entera solo. Dos formas de trabajar:

- **Programando de verdad en el frontend**: corré `npm run dev` localmente
  fuera de Docker (ver `agenda-frontend/README.md`), apuntando al backend en
  `http://localhost:8010`. Ahí sí tenés hot-reload normal.
- **Para que el contenedor Docker refleje tus cambios** (por ejemplo antes
  de una demo): `docker compose up -d --build web`.

El backend (`api`) sí sigue en modo dev con recarga automática (`--reload`
de uvicorn vía el volumen montado), eso no cambió.

## Compartir el proyecto por internet (túnel estable `agenda-demo`)

**No uses la pestaña "Ports" de VS Code para esto.** Ese método genera un
túnel efímero que cambia de prefijo cada vez que se reinicia la sesión de
VS Code, y además requiere marcar manualmente el puerto 8010 como "Public"
cada vez — un paso fácil de olvidar que causó una falla real (todas las
páginas mostraban "No se pudo cargar...", porque el navegador del cliente
no puede completar el login interactivo que exige un túnel sin acceso
anónimo, y eso se ve como un error de CORS aunque no lo sea).

En su lugar usamos un túnel persistente creado con la CLI `devtunnel`, con
acceso anónimo configurado **a nivel de túnel**, así que no hay nada que
marcar como Public cada vez ni URLs que cambien entre sesiones.

**Desde el 2026-08-10, quien sirve el túnel es la Raspberry Pi** (ver
sección "Correr este mismo proyecto en una Raspberry Pi" más abajo), no la
laptop — corre ahí como servicio systemd (`devtunnel-agenda-demo.service`),
así que se levanta solo si la Pi se reinicia o el proceso se cae, sin que
haga falta dejar una terminal abierta. Si la Pi está encendida con Docker
arriba, el túnel ya está sirviendo — no hay ningún paso manual del día a
día.

1. Confirmá que está activo (`Host connections: 1`) desde cualquier máquina
   con `devtunnel` instalado (no hace falta estar en la Pi):
   ```bash
   devtunnel show agenda-demo.usw3
   ```
2. Las URLs son fijas mientras el túnel exista:
   - Frontend: `https://5xtz0906-5183.usw3.devtunnels.ms`
   - API: `https://5xtz0906-8010.usw3.devtunnels.ms`

   `VITE_API_URL` se lee de un `.env` de raíz (no versionado, ver
   `.env.example`) — en la Pi ya apunta a la URL de la API de arriba.
3. Antes de compartir el link con el cliente, verificá que todo responde
   bien de punta a punta (funciona desde cualquier máquina, no hace falta
   estar en la Pi):
   ```bash
   ./verificar-tunel.sh
   ```

Si por algo hay que operar el túnel directamente en la Pi (ver logs,
reiniciarlo a mano, etc.):
```bash
ssh raspberrypi-yue                                    # o tu forma de entrar
sudo systemctl status devtunnel-agenda-demo.service    # ver estado/logs
sudo systemctl restart devtunnel-agenda-demo.service   # reiniciarlo
```

### Si el túnel `agenda-demo` expira o hay que recrearlo

Dura 30 días desde su creación. Antes de una demo agendada con mucha
anticipación, corré `devtunnel show agenda-demo.usw3` para confirmar que no
expiró. Si expiró o hay que crearlo desde cero:

```bash
devtunnel create agenda-demo --allow-anonymous
devtunnel port create agenda-demo -p 5183
devtunnel port create agenda-demo -p 8010
```

Como el prefijo nuevo va a ser distinto, hay que actualizar `VITE_API_URL`
en el `.env` de raíz (**en la Pi**, que es quien construye el frontend que
de verdad sirve el túnel) con la URL nueva del puerto 8010 y reconstruir:
`docker compose up -d --build web`. Sin este paso, el frontend sigue
llamando a la URL vieja y todo vuelve a fallar en silencio.

Para cargar los datos de prueba (7 usuarios, 4 proyectos) la primera vez:

```bash
docker compose exec api python seed.py
```

Esto imprime en la terminal los correos de prueba (todos con contraseña
`Demo1234!`). Entra a `http://localhost:5173` con cualquiera de ellos para
ver cómo cambia lo que se ve según el rol.

## App móvil (PWA)

El frontend ya es una PWA instalable (Android/iOS) y responsive — no hace
falta nada extra para probarla: abrí la URL del frontend (local o del
túnel, ver arriba) desde el navegador del celular y usá "Agregar a pantalla
de inicio". Queda instalada como app, sin pasar por Play Store/App Store.
Si tocás `agenda-frontend/`, reconstruí la imagen (`docker compose up -d
--build web`) para que el manifest/service worker reflejen el cambio.

## Correr este mismo proyecto en una Raspberry Pi

El repo vive en GitHub (`https://github.com/yueLight12/agenda-proyecto`,
privado) justo para poder clonarlo en otra máquina, como una Raspberry Pi 4
Model B. Todo el stack (PostgreSQL, backend en Python, frontend en Node)
tiene imágenes Docker con soporte ARM64, así que corre en la Pi sin cambiar
código.

1. En la Pi (requiere Raspberry Pi OS de **64 bits**, Docker y git ya
   instalados):
   ```bash
   git clone https://github.com/yueLight12/agenda-proyecto.git
   cd agenda-proyecto
   cp .env.example .env
   ```
2. Edita `.env` y pon en `VITE_API_URL` la IP local de la Pi en vez de
   `localhost` (necesario para poder abrir el frontend desde el navegador de
   otro dispositivo en la misma red, por ejemplo tu celular):
   ```
   VITE_API_URL=http://<ip-de-la-pi>:8010
   ```
   Si solo vas a usar el navegador de la propia Pi, `http://localhost:8010`
   (el valor por defecto) funciona igual.
3. Levanta todo igual que en la laptop:
   ```bash
   docker compose up --build
   docker compose exec api python seed.py   # datos de prueba, primera vez
   ```

### Qué NO va a funcionar igual en la Pi

- **Chatbot (Ollama)**: corre fuera de Docker, en la máquina host — en la Pi
  probablemente no tenga RAM/CPU suficiente para `mistral:7b-instruct-q4_0`
  a una velocidad usable. El resto de la app no se ve afectado: si Ollama no
  está corriendo, `POST /chatbot/consulta` responde con un error controlado
  (ver `app/services/chatbot.py`), no tumba nada más. Opciones si quieres el
  chatbot ahí de todos modos:
  - Probar un modelo más chico (`llama3.2:3b` o `phi3`, ya probados según
    `agenda-backend/README.md`).
  - O dejar Ollama corriendo en la laptop y apuntar `OLLAMA_URL` del backend
    de la Pi a la IP de la laptop en la red local, en vez de instalar Ollama
    en la Pi.
- **Transcripción de audio (whisper)**: sí corre (la imagen tiene build
  ARM64), pero más lento que en la laptop al no tener aceleración por
  hardware — para pruebas rápidas está bien, no para uso pesado.

### Mantener la laptop y la Pi sincronizadas

Cada máquina tiene su propio `.env` (no se versiona, cada una con su propia
`VITE_API_URL`/URLs locales). El código sí se sincroniza por git: `git push`
desde donde hiciste el cambio, `git pull` en la otra máquina antes de seguir
trabajando ahí.

## Cómo correrlo sin Docker (backend y frontend por separado)

Ver las instrucciones detalladas en `agenda-backend/README.md` y
`agenda-frontend/README.md`.

## Siguientes pasos

El estado actual del proyecto y lo que falta por construir está documentado
al final de `CLAUDE.md`, sección "Estado actual (dónde vamos)". Pide a
Claude Code que lo revise antes de empezar cualquier tarea nueva.

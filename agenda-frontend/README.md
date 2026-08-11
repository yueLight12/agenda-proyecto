# Agenda Inteligente de Proyectos — Frontend (Fase 2)

App web en React + Vite. Consume la API del backend (`agenda-backend`).

## Dos formas de correrlo: dev (hot-reload) vs. Docker (build de producción)

- **Local, fuera de Docker** (`npm run dev`, ver abajo): es el modo dev de
  Vite, con hot-reload — así se programa día a día.
- **Vía `docker compose` (raíz del repo)**: el `Dockerfile` compila con
  `npm run build` y sirve el resultado con `vite preview`, **no** con
  `vite dev`. Se cambió así porque este contenedor es el que se comparte por
  túnel público con el cliente, y en modo dev cada módulo se pide por
  separado — con la latencia de un túnel eso hace la carga muy lenta. La
  contra: ese contenedor no tiene hot-reload; hay que reconstruirlo
  (`docker compose up -d --build web` desde la raíz) para que refleje
  cambios de código. Ver el `README.md` de la raíz para más detalle,
  incluida la parte de `VITE_API_URL` como build-arg.

## Correr en desarrollo (sin Docker)

1. Instalar dependencias:
   ```bash
   npm install
   ```
2. Copiar `.env.example` a `.env` (por defecto ya apunta a `http://localhost:8000`,
   ajusta si tu backend corre en otro puerto/host).
3. Levantar el servidor de desarrollo:
   ```bash
   npm run dev
   ```
   Abre `http://localhost:5173`.

Nota: necesitas el backend corriendo (ver `../agenda-backend/README.md`) y,
de preferencia, haber corrido `python seed.py` ahí para tener usuarios de
prueba con los que hacer login.

## Estructura

```
src/
├── main.jsx              # Punto de entrada
├── App.jsx                # Definición de rutas
├── api/
│   ├── client.js            # Cliente axios (adjunta el JWT automáticamente)
│   └── endpoints.js         # Funciones de acceso a cada recurso de la API
├── context/
│   └── AuthContext.jsx      # Sesión del usuario (login/logout/perfil)
├── components/
│   ├── AppLayout.jsx           # Sidebar (drawer en móvil) + contenedor
│   ├── RutaProtegida.jsx       # Redirige a /login si no hay sesión
│   ├── EstatusBadge.jsx        # Etiqueta de estatus (pendiente/en_progreso/cumplido)
│   ├── Modal.jsx                # Modal genérico reutilizable (overlay + card + cerrar)
│   ├── FormularioEntregable.jsx # Modal para crear/editar un entregable
│   ├── ModalEquipo.jsx          # Modal para administrar los roles reales del equipo de un proyecto
│   ├── ModalEditarProyecto.jsx  # Modal para editar nombre/descripción/activo de un proyecto
│   ├── ModalHistorial.jsx       # Modal con gráfica (recharts) + tabla del histórico de avance
│   ├── ModalNotificaciones.jsx  # Modal con la lista de notificaciones in-app
│   ├── ModalCambiarPassword.jsx # Modal para cambiar la propia contraseña
│   ├── ModalReunion.jsx         # Modal para crear/editar una reunión
│   ├── ModalMinuta.jsx          # Modal de minuta (notas + acuerdos + convertir a entregable)
│   ├── PanelResumenProyecto.jsx # Panel expandible: equipo con entregables por persona + reuniones
│   └── CalendarioEntregables.jsx # Calendario reutilizable (react-big-calendar) con drag-and-drop
├── pages/
│   ├── Login.jsx
│   ├── Dashboard.jsx         # Resumen ejecutivo multi-proyecto (ruta "/")
│   ├── Proyectos.jsx         # Lista de proyectos del usuario
│   ├── TableroProyecto.jsx   # Vista principal: semáforo + resumen + tabla/calendario
│   ├── Equipo.jsx            # Plantilla personal reutilizable "mi equipo"
│   ├── MisPendientes.jsx     # Entregables propios pendientes, de todos los proyectos
│   ├── CalendarioGlobal.jsx  # Calendario con entregables y reuniones de todos los proyectos
│   └── Chatbot.jsx           # Asistente de consulta (solo lectura) contra el LLM local
└── styles/
    ├── tokens.css             # Paleta, tipografía, espaciados (variables CSS)
    └── app.css                # Layout, breakpoints responsive y componentes reutilizables
```

También es una **PWA** instalable (Android/iOS): `vite-plugin-pwa` está
configurado en `vite.config.js` (manifest + service worker), con los
íconos en `public/`.

## Qué ya funciona

- Login con JWT contra el backend, con opción de mostrar/ocultar la
  contraseña tipeada (botón "Ver"/"Ocultar" en el campo), y mensajes de
  error que distinguen credenciales inválidas de un problema de conexión
  con el servidor.
- Cambiar la propia contraseña desde un modal (`ModalCambiarPassword.jsx`,
  accesible desde el sidebar) contra `POST /auth/cambiar-password`.
- Lista de proyectos del usuario autenticado.
- Tablero de proyecto: resumen ejecutivo (avance global, vencidos, próximos,
  cumplidos) + tabla de entregables tipo semáforo, filtrados según el rol
  del usuario (esto lo resuelve el backend, el frontend solo pinta lo que
  recibe).
- Actualización de % de avance directamente desde la tabla (clic sobre la
  barra de progreso).
- Crear y editar entregables desde un modal (`FormularioEntregable.jsx`),
  incluyendo asignar responsable y marcar como sensible. Visible solo para
  N1/N2 del proyecto.
- Administrar equipo del proyecto desde un modal (`ModalEquipo.jsx`):
  agregar/reasignar rol (N1-N4) y quitar miembros. Visible solo para N1/N2
  del proyecto. El supervisor de un N3/N4 es opcional: si se deja en blanco,
  queda automáticamente quien está haciendo la asignación.
- "Mi equipo" (`pages/Equipo.jsx`): plantilla personal de personas + rol,
  independiente de cualquier proyecto, aplicable de un clic a un proyecto
  donde el usuario sea N1/N2 (`aplicar mi equipo`).
- Reuniones (`ModalReunion.jsx`) y minutas con acuerdos (`ModalMinuta.jsx`):
  agendar reuniones dentro de un proyecto, tomar notas y acuerdos, y
  convertir un acuerdo con responsable en un entregable real con un clic.
- Dashboard ejecutivo (`pages/Dashboard.jsx`, ruta `/`): resumen agregado de
  todos los proyectos visibles + reuniones próximas, con un panel
  expandible por proyecto (`PanelResumenProyecto.jsx`) que muestra los
  entregables agrupados por persona.
- Vista "Mis pendientes": junta los entregables propios de todos los
  proyectos donde el usuario participa.
- Histórico de avance por entregable: botón "Ver histórico" en el tablero
  abre un modal con gráfica de línea (librería `recharts`) y tabla de
  registros (`ModalHistorial.jsx`).
- Notificaciones in-app: botón "Notificaciones" en el sidebar con contador
  de no leídas, abre un modal con la lista y permite marcarlas como leídas
  (`ModalNotificaciones.jsx`). Se refrescan solas cada 60 segundos
  (`AppLayout.jsx`) mientras la sesión está abierta, sin recargar la página.
  Incluye avisos de entregable asignado y de actualización de avance
  (le llegan al supervisor de quien actualiza, en cada actualización, no
  solo al completarse).
- Estados de error visibles si falla una petición al backend (en vez de
  quedarse en blanco silenciosamente): Proyectos, Mis pendientes, Tablero
  de proyecto y al guardar el % de avance.
- Calendario de entregables (librería `react-big-calendar`), con vista de
  mes/semana/día y arrastrar-para-reprogramar:
  - **Por proyecto**: toggle "Tabla / Calendario" en el tablero de cada
    proyecto (`TableroProyecto.jsx`). Editable (arrastrar) solo si el
    usuario es N1/N2 en ese proyecto.
  - **Global**: página `/calendario` (link "Calendario" en el sidebar),
    junta entregables de todos los proyectos donde participa el usuario;
    el permiso de arrastrar se evalúa por entregable según su rol en el
    proyecto correspondiente.
  - Clic en un entregable abre su histórico de avance (reutiliza
    `ModalHistorial.jsx`).
  - No requirió cambios en el backend: reutiliza `PATCH /entregables/{id}`,
    que ya validaba que solo N1/N2 puedan cambiar la fecha de entrega.

- Instalable como PWA (Android/iOS, "Agregar a pantalla de inicio") y
  responsive: el sidebar colapsa a un drawer con botón hamburguesa en
  pantallas ≤768px, tablas y calendario con scroll horizontal contenido.

## Qué falta (ver también CLAUDE.md en la raíz del proyecto)

- Nada pendiente de Fase 2/3 por ahora. Lo que sigue es Fase 4 (carga de
  datos reales del cliente y demo) y, como siguiente entregable ya
  aprobado, un asistente de voz que ejecuta acciones (agendar reuniones,
  crear entregables, etc. por dictado) — ver CLAUDE.md sección 6.

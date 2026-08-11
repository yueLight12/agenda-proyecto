# Agenda Inteligente de Proyectos — Explicación General

Este documento resume qué es el sistema, qué hace hoy y cómo está construido.
Tiene dos partes: una explicación funcional (para el cliente y el equipo que
va a usar el sistema) y un detalle técnico (para quien vaya a tocar el
código). Para el diseño original aprobado antes de construir nada, ver
`docs/diseno-fase0-agenda-inteligente.md`. Para el estado día a día del
trabajo y las reglas de colaboración con Claude Code, ver `CLAUDE.md` en la
raíz del repo.

---

# Parte 1 — Explicación funcional

## ¿Qué es este sistema?

Es una agenda/tablero interno para dar seguimiento a los entregables de cada
proyecto de la empresa: qué hay que entregar, quién es responsable, para
cuándo, y qué tan avanzado va. Reemplaza el seguimiento manual (Excel,
mensajes sueltos) por un solo lugar donde cada quien ve lo que le
corresponde ver, según su rol.

## Roles y qué puede ver/hacer cada uno

Los permisos son **por proyecto**, no globales: una misma persona puede ser
líder en un proyecto y colaborador en otro.

| Rol | Nombre | Qué ve | Qué puede hacer |
|---|---|---|---|
| **N1** | Dirección | Todo: todos los proyectos, todos los entregables (incluidos los sensibles) | Todo: crear/editar entregables, administrar equipo y roles, ver todo |
| **N2** | Líder de proyecto | Su(s) proyecto(s) + los entregables de su equipo (incluidos los sensibles de su equipo) | Crear/editar entregables, administrar equipo de su proyecto, marcar entregables como sensibles |
| **N3** | Colaborador interno | Solo sus propios entregables + los no sensibles del proyecto | Actualizar su % de avance |
| **N4** | Colaborador externo | Igual que N3 (visibilidad reducida por defecto) | Actualizar su % de avance |

**Regla de sensibilidad**: un entregable marcado "sensible" solo lo ven N1 y
el/los N2 de ese proyecto. N3/N4 nunca lo ven, aunque participen en el mismo
proyecto.

**Regla de equipo de un N2**: cada N3/N4 queda ligado a un N2 específico
dentro de cada proyecto (su "supervisor" en ese proyecto). Un N2 solo ve a
su propia gente, no a la de otro N2 del mismo proyecto.

## Qué se puede hacer hoy en la aplicación

- **Iniciar sesión** con correo y contraseña.
- **Ver la lista de proyectos** en los que el usuario participa.
- **Tablero de cada proyecto**: resumen ejecutivo (% de avance global, cuántos
  entregables están vencidos, próximos a vencer y cumplidos) + tabla de
  entregables tipo semáforo.
- **Actualizar el % de avance** de un entregable con un clic sobre su barra
  de progreso.
- **Crear y editar entregables** (nombre, descripción, responsable, fecha de
  entrega, marcarlo como sensible) — solo N1/N2.
- **Administrar el equipo de un proyecto**: agregar personas, asignarles rol
  (N1-N4) y, si aplica, su supervisor N2 — solo N1/N2.
- **Ver el histórico de avance** de un entregable en una gráfica de línea (% a
  través del tiempo) más una tabla con quién actualizó qué y cuándo.
- **Ver un calendario** de entregables, en dos modalidades:
  - Por proyecto (dentro del tablero, alternando entre vista de tabla y de
    calendario).
  - Global (una sola vista con los entregables de todos los proyectos donde
    participa el usuario).
  En ambos casos se puede **arrastrar un entregable a otro día** para
  reprogramar su fecha de entrega — solo si el usuario es N1/N2 en ese
  proyecto.
- **Notificaciones dentro de la app**: un contador en el menú avisa cuántas
  notificaciones no leídas hay: entregables próximos a vencer o vencidos,
  que a alguien le asignaron un entregable nuevo, que un compañero de
  equipo actualizó su % de avance (le llega a su supervisor, en cada
  actualización, no solo al completarse), o que algo se marcó como
  cumplido. Se revisan solas cada minuto mientras la sesión está abierta.
- **"Mis pendientes"**: una vista que junta, de todos los proyectos donde
  participa el usuario, únicamente los entregables propios que aún no están
  cumplidos.
- **Dashboard ejecutivo**: al entrar a la app, un resumen agregado de todos
  los proyectos visibles (avance global, entregables vencidos/próximos/
  cumplidos, reuniones de los próximos 7 días) sin tener que entrar
  proyecto por proyecto. Cada proyecto se puede desplegar ahí mismo para
  ver su equipo con los entregables de cada persona agrupados debajo (para
  saber quién hace qué de un vistazo).
- **Reuniones**: agendar una reunión dentro de un proyecto (título, fecha,
  duración, participantes) — cualquier persona del proyecto puede agendar
  una, no solo N1/N2. Aparecen también en el calendario, por proyecto y
  global.
- **Minutas y acuerdos**: cada reunión puede tener una minuta con notas
  libres y una lista de acuerdos. Un acuerdo con responsable se puede
  convertir con un clic en un Entregable real (con fecha límite), usando
  las mismas reglas de asignación que crear un entregable a mano.
- **"Mi equipo"**: cada usuario puede guardar su propia lista de personas +
  rol (una plantilla personal, no ligada a un proyecto) y aplicarla de un
  clic a cualquier proyecto donde sea N1/N2, en vez de agregar a cada
  persona una por una.
- **Asistente de consulta (chatbot)**: una pantalla de chat donde el usuario
  pregunta en lenguaje natural cosas como "¿qué tengo pendiente esta
  semana?" o "¿cómo va el Proyecto Alfa?", y recibe una respuesta redactada
  a partir de sus propios datos (respetando las mismas reglas de rol de
  arriba — nunca ve algo que no le correspondería ver en el tablero). Por
  ahora es de **solo consulta**: no crea, edita ni modifica nada.
- **App móvil (PWA)**: la web se instala como app desde el navegador en
  Android e iPhone ("Agregar a pantalla de inicio"), sin pasar por Play
  Store/App Store, con el diseño adaptado a pantalla chica.

## Qué NO hace todavía (a propósito, son fases futuras)

- Notificaciones por correo o WhatsApp (hoy son solo dentro de la app).
- Minutas de reunión con transcripción o IA (las minutas manuales de arriba
  ya existen; esto es agregarles voz/IA encima).
- Un asistente de voz con capacidad de **ejecutar acciones** por dictado
  (ej. "agenda una reunión con David el jueves a las 3pm" y que la cree de
  verdad) — aprobado como el siguiente entregable de la app móvil, con
  arquitectura ya definida (reconocimiento de voz local, confirmación
  obligatoria antes de ejecutar, reutilizando las mismas reglas de permisos
  de siempre), pero todavía sin construir.

Estas quedaron identificadas como fuera de alcance del MVP, y no se deben
construir sin que el cliente lo pida explícitamente.

## Qué falta por hacer ahora mismo

Todo lo funcional descrito arriba ya está construido, incluyendo
funcionalidad que se adelantó al roadmap original (reuniones, minutas,
dashboard ejecutivo, "mi equipo", chatbot de consulta y la app móvil como
PWA). Lo único que queda pendiente del roadmap original es la **Fase 4**:
cargar los datos reales de los proyectos del cliente (hoy solo hay datos de
prueba, ver más abajo) y hacer la demo formal. Como siguiente entregable ya
aprobado (en paralelo a la Fase 4) está el asistente de voz mencionado
arriba.

---

# Parte 2 — Detalle técnico

## Arquitectura y stack

```
agenda-backend/     API en FastAPI (Python) + PostgreSQL + JWT
agenda-frontend/    App web en React + Vite
docs/                Documentación de diseño y de estado del proyecto
```

- **Backend**: Python + FastAPI + SQLAlchemy + PostgreSQL. Autenticación con
  JWT. Todo el código, nombres y comentarios están en español.
- **Frontend**: React + Vite. JSX en español para lo visible al usuario.
  Estilos con CSS plano (variables en `src/styles/tokens.css`), sin
  librería de UI.
- **Todo corre con Docker** (hay un `docker-compose.yml` en la raíz del
  repo que levanta los tres servicios juntos, y uno independiente dentro de
  cada carpeta para desarrollarlas por separado).
- El proyecto está pensado para eventualmente migrar a AWS: no hay rutas
  absolutas ni nada atado a "correr en mi laptop"; todo se configura por
  variables de entorno.

## Modelo de datos

```
usuarios (id, nombre, email, password_hash, activo, fecha_creacion)

proyectos (id, nombre, descripcion, activo, fecha_creacion)

usuario_proyecto_rol (id, usuario_id, proyecto_id, rol[N1-N4], supervisor_id)
  -- UNIQUE(usuario_id, proyecto_id). supervisor_id liga un N3/N4 a su N2
  -- dentro de ESE proyecto específico.

entregables (id, proyecto_id, nombre, descripcion, responsable_id,
             fecha_entrega, porcentaje_avance, estatus[pendiente|en_progreso|
             cumplido], sensible, creado_por, fecha_creacion)

historial_avance (id, entregable_id, porcentaje_avance, actualizado_por,
                   fecha_registro)
  -- una fila por cada cambio de % de avance de un entregable.

notificaciones (id, usuario_id, entregable_id, tipo[recordatorio_proximo|
                recordatorio_vencido|entregable_asignado|avance_actualizado|
                otro], mensaje, leida, fecha_creacion)

reuniones (id, proyecto_id, titulo, notas, fecha_inicio, duracion_minutos,
           organizador_id, fecha_creacion)

reunion_participantes (id, reunion_id, usuario_id)
  -- tabla puente: quién está invitado a cada reunión.

minutas (id, reunion_id [UNIQUE, una minuta por reunión], contenido,
         creado_por, fecha_creacion, fecha_actualizacion)

acuerdos_minuta (id, minuta_id, descripcion, responsable_id, entregable_id
                 [se llena solo al convertir], convertido, fecha_creacion)

equipo_miembros (id, propietario_id, usuario_id, rol[N1-N4], fecha_creacion)
  -- UNIQUE(propietario_id, usuario_id). Plantilla personal de "mi equipo",
  -- independiente de cualquier proyecto.
```

## Reglas de visibilidad (dónde viven y cómo funcionan)

Toda la lógica de permisos está centralizada en
`agenda-backend/app/core/permissions.py` (función principal
`query_entregables_visibles`). Ningún router debe duplicar esta lógica.

```
Al consultar entregables de un proyecto para un usuario X:

SI rol(X, proyecto) == N1:
    devolver TODOS los entregables del proyecto

SI rol(X, proyecto) == N2:
    devolver entregables donde:
        responsable pertenece al equipo de X (supervisor_id == X.id)
        O responsable == X
        (sensibles incluidos)

SI rol(X, proyecto) == N3 o N4:
    devolver entregables donde:
        responsable_id == X.id
        O (mismo proyecto Y sensible == false)
```

La misma regla aplica para ver el equipo del proyecto (quién ve a quién en
"Administrar equipo").

**Reuniones** tienen su propia visibilidad, análoga pero no idéntica (N1 ve
todas las del proyecto; el resto solo donde participa, como organizador o
invitado) — funciones `query_reuniones_visibles`/`puede_ver_reunion`/
`puede_editar_reunion` en el mismo `permissions.py`. Las **minutas** no
tienen reglas propias: heredan la visibilidad/edición de su reunión.

**Asignar rol N3/N4 sin elegir supervisor**: si al agregar a alguien como
N3/N4 no se especifica supervisor, queda automáticamente como supervisor
quien está haciendo la asignación (sea N1 o N2) — así alguien que acaba de
crear un proyecto (y por tanto es N1 ahí) puede agregar a su primer
colaborador sin tener que nombrar antes a un N2.

## Backend — routers y endpoints principales

| Router | Endpoints | Notas |
|---|---|---|
| `auth` | `POST /auth/login`, `GET /auth/me` | Login con OAuth2PasswordRequestForm, JWT |
| `usuarios` | `GET/POST /usuarios`, `PATCH /usuarios/{id}` | Solo N1 (en algún proyecto) |
| `proyectos` | `GET/POST /proyectos`, `GET/PATCH /proyectos/{id}`, `DELETE /proyectos/{id}` (solo N1 estricto), `GET/POST/DELETE /proyectos/{id}/usuarios` | Filtrado por rol; asignar rol requiere N1/N2; si no se manda `supervisor_id` para N3/N4, queda quien asigna |
| `entregables` | `GET/POST /proyectos/{id}/entregables`, `GET/PATCH /entregables/{id}`, `PATCH /entregables/{id}/avance`, `GET /entregables/{id}/historial` | Creación/edición general requiere N1/N2; el % de avance lo puede actualizar el responsable o N1/N2; cada actualización notifica al supervisor del responsable |
| `notificaciones` | `GET /notificaciones`, `PATCH /notificaciones/{id}` | Del usuario autenticado |
| `resumen` | `GET /proyectos/{id}/resumen` | Solo sobre entregables visibles para quien consulta |
| `dashboard` | `GET /dashboard/resumen` | Resumen agregado de todos los proyectos visibles + reuniones próximas + notificaciones no leídas |
| `reuniones` | `GET/POST /proyectos/{id}/reuniones`, `GET/PATCH/DELETE /reuniones/{id}` | Cualquier participante del proyecto puede agendar; editar/eliminar requiere ser N1/N2 o el organizador |
| `minutas` | `GET/POST /reuniones/{id}/minuta`, `POST /minutas/{id}/acuerdos`, `DELETE /acuerdos/{id}`, `POST /acuerdos/{id}/convertir-a-entregable` | Hereda permisos de la reunión; convertir un acuerdo llama al mismo servicio que crear un entregable a mano |
| `equipos` | `GET/POST /mi-equipo`, `DELETE /mi-equipo/{usuario_id}`, `POST /proyectos/{id}/aplicar-mi-equipo` | Plantilla personal reutilizable; aplicarla a un proyecto requiere N1/N2 |
| `admin` | `POST /admin/generar-recordatorios` | Disparo manual del barrido de recordatorios (ver siguiente sección) |
| `chatbot` | `POST /chatbot/consulta` | Solo lectura; ver sección "Chatbot de consulta" más abajo |

## Recordatorios y notificaciones automáticas

`app/services/recordatorios.py` revisa todos los entregables no cumplidos y
genera una notificación de "vencido" (si ya pasó la fecha) o "próximo a
vencer" (si falta `DIAS_ALERTA_ENTREGABLE` días o menos), evitando duplicar
la misma notificación el mismo día. Este barrido corre solo, dentro del
proceso de la API, gracias a un scheduler (`APScheduler`) configurado en
`app/main.py`: se ejecuta una vez al arrancar y luego cada
`HORAS_ENTRE_BARRIDOS_RECORDATORIOS` horas (por defecto 6). El endpoint
`POST /admin/generar-recordatorios` sigue existiendo para forzar el barrido
manualmente si hace falta probar algo puntual.

Además, al marcar un entregable como "cumplido" desde
`PATCH /entregables/{id}/avance`, se genera automáticamente una notificación
para quien creó ese entregable.

## Chatbot de consulta (LLM local, sin salir a internet)

El cliente tiene un firewall corporativo que bloquea llamadas salientes a
internet, así que el chatbot **no usa ninguna API externa** — corre sobre
un modelo de lenguaje local vía [Ollama](https://ollama.com), instalado en
la máquina host (fuera de Docker) y accedido por el contenedor de la API
vía `host.docker.internal`. Esto permite hacer la demo dentro de la propia
red del cliente sin depender de que aprueben una excepción de firewall.

Flujo: `app/services/chatbot.py` arma un bloque de texto con los datos que
el usuario que pregunta **ya puede ver** (reutilizando
`query_entregables_visibles`, la misma función de permisos de todo el
sistema — nada nuevo que auditar ahí), se lo pasa al modelo junto con la
pregunta, y devuelve la respuesta redactada. El modelo **nunca** decide qué
es visible ni toca la base de datos directamente.

Modelo probado: `mistral:7b-instruct-q4_0` (cabe en 6GB de VRAM con
aceleración GPU). Configurable vía `OLLAMA_URL` / `OLLAMA_MODELO` en
`agenda-backend/.env`.

**Nota para cuando se construya el chatbot de acciones** (fase futura, no
iniciar sin aprobación explícita): el patrón de este chatbot de consulta —
pedir algo → pasar por una función de servicio que ya respeta permisos →
regresar el resultado — es la misma base que usaría un chatbot de acciones,
solo que ahí además se necesitaría un paso de confirmación explícita del
usuario antes de ejecutar cualquier cambio.

## Frontend — páginas y componentes

| Página (`src/pages/`) | Ruta | Qué hace |
|---|---|---|
| `Login.jsx` | `/login` | Login con JWT |
| `Dashboard.jsx` | `/` | Resumen ejecutivo multi-proyecto + reuniones próximas + panel expandible por proyecto |
| `Proyectos.jsx` | `/proyectos` | Lista de proyectos del usuario, edición vía `ModalEditarProyecto` |
| `TableroProyecto.jsx` | `/proyectos/:proyectoId` | Entregables (tabla/calendario), equipo, reuniones, historial de un proyecto |
| `Equipo.jsx` | `/equipo` | Plantilla personal reutilizable "mi equipo" |
| `MisPendientes.jsx` | `/mis-pendientes` | Entregables propios no cumplidos, de todos los proyectos |
| `CalendarioGlobal.jsx` | `/calendario` | Calendario con entregables y reuniones de todos los proyectos del usuario |
| `Chatbot.jsx` | `/chatbot` | Chat de consulta (solo lectura) contra el LLM local |

| Componente (`src/components/`) | Qué hace |
|---|---|
| `AppLayout.jsx` | Sidebar/drawer móvil + contenedor + campana de notificaciones (polling cada 60s) |
| `RutaProtegida.jsx` | Redirige a `/login` si no hay sesión |
| `EstatusBadge.jsx` | Etiqueta visual de estatus |
| `Modal.jsx` | Modal genérico reutilizable |
| `FormularioEntregable.jsx` | Crear/editar un entregable |
| `ModalEquipo.jsx` | Administrar los roles reales del equipo de un proyecto específico |
| `ModalEditarProyecto.jsx` | Editar nombre/descripción/activo de un proyecto |
| `ModalHistorial.jsx` | Gráfica (recharts) + tabla del histórico de avance de un entregable |
| `ModalNotificaciones.jsx` | Lista de notificaciones, marcar como leídas |
| `ModalCambiarPassword.jsx` | Cambiar la propia contraseña |
| `ModalReunion.jsx` | Crear/editar una reunión |
| `ModalMinuta.jsx` | Notas + acuerdos de una reunión, con conversión de acuerdo a entregable |
| `PanelResumenProyecto.jsx` | Vista compacta expandible de un proyecto (equipo con entregables agrupados por persona, reuniones), usada en Dashboard y en el Tablero |
| `CalendarioEntregables.jsx` | Calendario reutilizable (`react-big-calendar`) con drag-and-drop para reprogramar fechas, usado tanto en el tablero por proyecto como en el calendario global |

La app también se puede **instalar como PWA** en Android/iOS ("Agregar a
pantalla de inicio") — configurado con `vite-plugin-pwa` en
`vite.config.js` (manifest + service worker, íconos en
`agenda-frontend/public/`), con el layout adaptado a pantalla chica
(drawer de navegación, tablas con scroll horizontal contenido).

El cliente de API centralizado vive en `src/api/endpoints.js` (agrupado por
recurso: `authApi`, `proyectosApi`, `entregablesApi`, `usuariosApi`,
`notificacionesApi`, `chatbotApi`) sobre un cliente axios en
`src/api/client.js` que adjunta el JWT automáticamente.

## Cómo levantar el proyecto

**Todo junto, con Docker (recomendado):**
```bash
docker compose up --build
```
Desde la raíz del repo. Levanta PostgreSQL (`localhost:5442`), la API
(`http://localhost:8010`, docs en `/docs`) y el frontend
(`http://localhost:5183`).

Para cargar datos de prueba (primera vez):
```bash
docker compose exec api python seed.py
```

Para que el chatbot de consulta funcione, además necesitas
[Ollama](https://ollama.com) instalado y corriendo en tu máquina (fuera de
Docker), con el modelo descargado:
```bash
ollama pull mistral:7b-instruct-q4_0
```

**Backend y frontend por separado**: ver instrucciones detalladas en
`agenda-backend/README.md` y `agenda-frontend/README.md` (cada carpeta tiene
también su propio `docker-compose.yml`, con los puertos por defecto 8000 y
5173, para desarrollarlas de forma aislada).

**Instalar como app móvil**: entrando desde el navegador del celular
(Android o iPhone) a la URL del frontend (ver "Compartir el proyecto por
internet" en el `README.md` raíz), usar "Agregar a pantalla de inicio" —
queda instalada como app, sin pasar por Play Store/App Store.

## Usuarios de prueba (`seed.py`)

Contraseña para todos: `Demo1234!`

| Email | Rol | Proyectos |
|---|---|---|
| `n1@demo.com` | N1 | Alfa, Beta, Gamma, Delta (ve todo) |
| `n2a@demo.com` | N2 | Alfa, Gamma, Delta |
| `n2b@demo.com` | N2 | Beta, Gamma |
| `n3a@demo.com` | N3 | Alfa, Gamma (supervisado por n2a) |
| `n3b@demo.com` | N3 | Alfa, Delta (supervisado por n2a) |
| `n3c@demo.com` | N3 | Beta, Gamma (supervisado por n2b) |
| `n4a@demo.com` | N4 | Alfa (supervisado por n2a) |

## Roadmap

1. ~~Fase 0: diseño~~ ✅
2. ~~Fase 1: backend base~~ ✅
3. ~~Fase 2: frontend base~~ ✅
4. ~~Fase 3: resumen ejecutivo + notificaciones in-app~~ ✅
5. ~~Chatbot de consulta (solo lectura, LLM local vía Ollama)~~ ✅ — fase
   adelantada del roadmap original, construida antes de la Fase 4 porque el
   firewall del cliente obligó a resolver primero el enfoque "sin internet".
6. ~~Reuniones, minutas/acuerdos, dashboard ejecutivo, "mi equipo"~~ ✅ —
   funcionalidad adelantada del roadmap original, construida en paralelo.
7. ~~App móvil — Milestone A: PWA instalable + responsive~~ ✅ (2026-08-08).
8. **Fase 4 (pendiente)**: carga de datos reales del cliente + demo formal.
9. **App móvil — Milestone B (aprobado, siguiente entregable)**: asistente
   de voz con capacidad de ejecutar acciones (agendar reuniones, crear
   entregables, etc. por dictado), con reconocimiento de voz local,
   confirmación obligatoria antes de ejecutar, y reutilizando las mismas
   reglas de permisos de siempre. Arquitectura definida, aún sin construir.
10. Fases futuras (no iniciar sin aprobación explícita): notificaciones por
    correo/WhatsApp, minutas con transcripción/IA.

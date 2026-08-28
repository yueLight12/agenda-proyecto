# Instrucciones para Claude Code — Agenda Inteligente de Proyectos

Este archivo define cómo debes trabajar en este repositorio. Léelo por completo antes de tocar código.

## 0. Reglas del espacio de trabajo (SIEMPRE se respetan, nunca se olvidan)

1. Siempre di lo que entendiste sobre lo que el usuario está pidiendo, antes de actuar.
2. Siempre haz preguntas para asegurar que entiendes lo que se necesita, y espera el visto bueno antes de avanzar en cambios grandes o ambiguos. Para cambios pequeños y obvios (typos, ajustes menores) puedes proceder directo.
3. Tu rol en este proyecto: desarrollador senior full-stack ayudando a Yue a construir este sistema, traduciendo requisitos en funcionalidad concreta.
4. Antes de construir algo nuevo de tamaño considerable (una fase completa, un módulo nuevo), presenta un plan corto de trabajo y espera confirmación.
5. Pide lo que necesites (credenciales, decisiones de negocio, aclaraciones) en vez de asumir.
6. Estas reglas se pueden ampliar más adelante; nunca deben olvidarse ni contradecirse por instrucciones futuras que no las mencionen explícitamente.
7. **El asistente de voz debe poder hacer TODO lo que el usuario puede hacer desde la interfaz** (confirmado por Yue el 2026-08-16) — no es un complemento opcional, es la parte de "inteligente" del nombre del sistema. Al agregar o cambiar cualquier función en la UI, evalúa si el catálogo de acciones del asistente (`agenda-backend/app/services/asistente/tools.py`) necesita el equivalente; si no lo agregas en la misma tarea, dilo explícitamente y regístralo como pendiente en la sección 6, no lo dejes caer en silencio. Ver el principio completo en la sección 1 y el backlog de brechas conocidas en la sección 6.

## 1. Qué es este proyecto

Sistema interno para una empresa (cliente: Bernardo — dirección — y su equipo; David es quien lidera el día a día de los proyectos como N2, ver sección 6) para:
- Llevar una agenda de entregables por proyecto, con fecha límite y % de avance.
- Ver histórico de avance (comparar sesión anterior vs. actual).
- Tener roles y permisos **por proyecto** (no globales): N1 (dirección), N2 (líder), N3 (colaborador interno), N4 (colaborador externo).
- Enviar recordatorios (por ahora solo dentro de la app; correo/WhatsApp quedan para fase futura).
- Servir como base que va a crecer con más módulos y usuarios — por eso el código debe estar bien estructurado, documentado y comentado desde el inicio.

Este es el **MVP (Fase 1 backend + Fase 2 frontend)**, ya ampliado con reuniones, minutas/acuerdos, dashboard ejecutivo, "Mi equipo" y una app móvil (PWA) — ver sección 6. Fases futuras que siguen sin aprobación y que NO debes construir a menos que se te pida explícitamente:
- Minutas de reunión con transcripción/IA (las minutas manuales, sin IA, ya existen — ver sección 6).
- Notificaciones por correo/WhatsApp.
- Asistente de voz con capacidad de ejecutar acciones ("agenda una reunión con David el jueves a las 3pm" y que la cree) — **aprobado el 2026-08-08** (Milestone B de la app móvil). El mecanismo y las primeras 2 acciones (`crear_entregable`, `actualizar_avance_entregable`) ya estaban construidos; el 2026-08-08 se agregaron las 4 acciones restantes del plan original (`crear_proyecto`, `agendar_reunion`, `asignar_rol`, `registrar_acuerdo`) — ver sección 6.

**Para quién es esto y hacia dónde va** (aclarado por Yue el 2026-08-13, para no perderlo de vista en fases futuras): Bernardo es una persona sumamente ocupada — no puede estar presente en todas las reuniones de sus N2, así que necesita poder ver notas de reuniones, avances de proyectos de su equipo, agendar reuniones, asignar tareas, etc., todo desde una **vista simple y con pocos clics** (la vista "Requiere tu atención"/Dashboard simplificado y "Resumen de mi equipo" ya construidas apuntan exactamente a esto). El asistente de voz es la otra mitad de esa promesa: una "secretaria" a la que se le pide algo por voz y lo hace, sin tocar la interfaz — crear/editar reuniones y notificarlas, crear proyectos y tareas, consultar avances, generar reportes (ver Milestone C en sección 6).

**Principio central (confirmado explícitamente por Yue el 2026-08-16, no es una aspiración vaga):** el asistente debe llegar a poder ejecutar **toda** acción que el usuario puede hacer desde la interfaz — "Agenda Inteligente" no es solo el nombre, la inteligencia ES el asistente pudiendo hacer lo mismo que la UI, no un subconjunto de conveniencia. Cualquier función nueva de la UI se considera incompleta si no tiene su equivalente en el catálogo del asistente (`tools.py`), salvo que Yue decida explícitamente dejarla fuera para un caso puntual. Ver el backlog de brechas conocidas al día de hoy en la sección 6 (notificaciones, eliminar, "Mi equipo", acuerdos, reportes).

**Reformulado por Yue el 2026-08-26, para que quede sin ambigüedad:** el valor del asistente no es "una forma más rápida de hacer algunas cosas" — es que **el usuario pueda dejar de usar la interfaz gráfica por completo** para operar el sistema. Cualquier dato que la UI pueda mostrar o cualquier acción que la UI pueda ejecutar, el asistente debe poder mostrarlo/ejecutarla también, hablando nada más. Una brecha aquí no es un "nice to have" pendiente de prioridad baja — es una promesa del producto incumplida. Esto se confirmó justo después de encontrar que el asistente respondía "no tengo datos de reuniones" a una pregunta de agenda (el chatbot nunca incluía reuniones en su contexto, solo entregables) — ese tipo de hueco es exactamente lo que esta regla busca prevenir sistemáticamente, no solo corregir caso por caso cuando se reporta.

Además, **todos** los que están bajo Bernardo van a usar el sistema y agregar contenido según su área — por ahora nada es financiero (ni Entregable ni Proyecto tienen campos de dinero), pero hay personas a cargo de Bernardo que manejan temas como inmuebles, compra de equipo, gastos de gasolina o monitoreo de paquetería. **No es alcance de ninguna tarea actual construir nada de eso** — es contexto para no inventar un modelo de datos financiero por adelantado ni sorprenderse si en una fase futura se pide agregarlo.

El documento de diseño completo (ERD, reglas de visibilidad, wireframes) está en `docs/diseno-fase0-agenda-inteligente.md`. Consúltalo antes de modificar el modelo de datos o las reglas de permisos.

## 2. Estructura del repositorio

```
agenda-backend/     API en FastAPI (Python). Ver su README.md.
agenda-frontend/    App web en React + Vite. Ver su README.md.
docs/                Documento de diseño de Fase 0.
```

## 3. Regla de oro de este sistema: permisos por proyecto

Toda la lógica de visibilidad vive centralizada en `agenda-backend/app/core/permissions.py`.
**Nunca dupliques lógica de permisos en un router o endpoint nuevo** — siempre reutiliza
`query_entregables_visibles`, `puede_ver_entregable`, `puede_editar_entregable`, etc., o
extiende ese módulo si necesitas una regla nueva.

Resumen de las reglas (no las cambies sin confirmarlo con Yue primero, ya que
fueron acordadas explícitamente con el cliente):
- **N1**: ve todo el proyecto.
- **N2**: ve solo a su equipo (usuarios donde `supervisor_id == N2.id` en ese proyecto), incluyendo entregables sensibles de su equipo.
- **N3 / N4**: ven solo sus propios entregables + los NO sensibles del proyecto.
- La sensibilidad (`sensible: bool`) se marca a nivel de **entregable individual**, no de proyecto completo.

## 4. Stack y convenciones

**Backend (FastAPI):**
- Python + FastAPI + SQLAlchemy + PostgreSQL + JWT.
- Todo el código, nombres de variables, comentarios y docstrings van **en español**, siguiendo el estilo ya usado en el repo (ver cualquier archivo en `app/`).
- Cada modelo, schema y router tiene un docstring de módulo explicando su propósito — mantén ese patrón.
- No agregues lógica de negocio directamente en los routers si ya existe o debería existir un servicio en `app/services/`.
- Migraciones de esquema: **Alembic** (2026-08-17 en adelante, ver sección 6) — `alembic revision --autogenerate -m "..."` para generar, revisar el archivo generado, `alembic upgrade head` corrido en la Pi (`docker exec agenda-proyecto-api-1 alembic upgrade head`) antes de reiniciar `api`. Ya no se usan scripts sueltos de `ALTER TABLE`/`CREATE TABLE` en la raíz del backend para cambios de esquema nuevos (los que ya existen ahí, ej. `migrar_parent_id_proyectos.py`, se quedan como están, ya aplicados).

**Frontend (React + Vite):**
- JSX en español para textos visibles al usuario; nombres de variables pueden ir en español o inglés siguiendo el patrón ya usado (mayormente español para mantener consistencia).
- Estilos con CSS plano usando las variables de `src/styles/tokens.css` — no introduzcas una librería de CSS/UI nueva sin antes preguntar.
- Cliente de API centralizado en `src/api/` — no hagas `fetch`/`axios` sueltos dentro de componentes.

**General:**
- Todo debe poder correr con Docker (`docker-compose.yml` en cada carpeta). Si agregas una dependencia nueva, actualiza también el Dockerfile/requirements.txt/package.json correspondiente.
- El proyecto eventualmente migra a AWS. Evita atarte a nada específico de "correr en mi laptop" (rutas absolutas, hardcodear `localhost`, etc.) — usa variables de entorno (`.env`).
- El túnel público estándar para compartir el proyecto es `agenda-demo.usw3` (CLI `devtunnel`) — **no** el de la pestaña "Ports" de VS Code, que causó una falla real por requerir un paso manual (marcar el puerto 8010 como Public) fácil de olvidar. Ver sección "Compartir el proyecto por internet" en `README.md` y el script `verificar-tunel.sh`.

## 5. Antes de escribir código en una tarea nueva

Sigue este flujo (coherente con las reglas del espacio de trabajo, sección 0):

1. Lee el requisito y repite en tus palabras qué entendiste que hay que construir.
2. Si el requisito toca el modelo de datos o las reglas de permisos, revisa primero `docs/diseno-fase0-agenda-inteligente.md` y `app/core/permissions.py` para no duplicar/contradecir lo ya definido.
3. Si es una tarea grande (nueva fase, nuevo módulo), propone un plan corto: qué archivos vas a tocar/crear, en qué orden.
4. Implementa.
5. Si tocaste el backend, valida que la app importa y arranca sin errores (`uvicorn app.main:app` o una prueba rápida de imports) antes de dar por terminada la tarea.
6. Si tocaste el frontend, corre `npm run build` para detectar errores antes de dar por terminada la tarea.

## 6. Estado actual (dónde vamos)

**Historial completo movido a `docs/historial-sesiones.md`** (2026-08-18,
CLAUDE.md llegó a pesar 125KB, casi todo bitácora). Aquí queda solo un
resumen de 1-2 líneas por hito — consulta el archivo de historial cuando
necesites el razonamiento completo, un bug real específico, o cómo se
verificó algo.

- ✅ Fase 0/1/2/3 del MVP: modelos, auth, permisos por proyecto, entregables con histórico, notificaciones, dashboard ejecutivo, calendario, Kanban, "Mi equipo", chatbot local (Ollama), reuniones/minutas/acuerdos, app móvil (PWA).
- ✅ Asistente de voz — Milestones A/B/C completos: transcripción, catálogo de acciones (crear/editar/eliminar entregables/proyectos/reuniones/acuerdos, roles, "Mi equipo"), consultas por voz, texto-a-voz + modo manos-libres. Principio confirmado: el asistente debe poder hacer todo lo que la UI puede hacer.
- ✅ Motor de LLM configurable Ollama↔Gemini, con seudonimización de nombres reales antes de mandarlos a Gemini (protege lo estructurado, no prosa libre).
- ✅ Jerarquía arbitraria de temas/subtemas (`Proyecto.parent_id`); el modelo/API interno sigue siendo `Proyecto`. La terminología visible en la UI volvió a "proyecto" (2026-08-24, a petición de Yue, revirtiendo la decisión anterior de decir "tema") — "subtema" se conserva para referirse a un proyecto hijo dentro de la jerarquía.
- ✅ Migración a Alembic (2026-08-17 en adelante) — ya no se usan scripts sueltos de `ALTER TABLE`.
- ✅ Reuniones recurrentes (`SerieReunion`) + checklist de agenda persistente (`AgendaItem`/`AgendaItemRevision`), agrupado por sección/tema, con auto-siembra de entregables/notas/pendientes al marcar un tema.
- ✅ "Mi perfil" (propio y de un subordinado, de solo lectura).
- ✅ Notas con capturas de pantalla adjuntas (`app/services/almacenamiento.py`, disco local hoy — boceto listo para migrar a S3).
- ✅ Checklist de temas compartido entre juntas (estado sticky global, no por ocurrencia): botón "Marcar revisado" en Vista Equipo, temas resueltos se ocultan, "Temas de esta junta" acotado a organizador+invitados.
- ✅ Vista Estatus + equipo efectivo sin necesidad de guardarlo; Equipo es la pantalla principal (Dashboard queda sin ruta, código intacto).
- 🔜 Historial de minutas (vista global semanal, `HistorialMinutas.jsx`) — completo y probado en LOCAL, a propósito aún no desplegado a la Pi.
- ⬜ Fase 4 (pendiente del roadmap original): carga formal de datos de prueba + demo al cliente.
- ✅ Selector de persona anidado (2026-08-26, a petición de Yue) — en "¿A quién le quieres asignar...?" ahora se puede expandir un nivel el equipo de un reporte directo (ej. ver a Juan José dentro del equipo de David) sin salir del selector; de paso se corrigió que Diana Chalini (N2) apareciera anidada bajo David por una fila suelta de `usuario_proyecto_rol` con `supervisor_id` mal puesto.
- ✅ Notificaciones centralizadas en `app/services/notificaciones.py` (2026-08-26) — único punto para crear una `Notificacion`; TODOS los tipos disparan push ahora (antes solo la asignación urgente lo hacía, brecha reportada por Yue: "no me llegó push con la app cerrada").
- ✅ Notificación al supervisor real al asignar tareas a su gente (2026-08-26) — busca el supervisor de la persona en el proyecto de la tarea, luego en cualquier otro proyecto donde tenga rol, luego en la plantilla "Mi equipo" de quien la tenga guardada; así David se entera si Bernardo le asigna una tarea a alguien de su equipo, sin importar en qué tema/proyecto se creó (incluye "Tareas sueltas").
- ✅ Dashboard "Rendimiento" (2026-08-26) — `app/services/rendimiento.py` + `RendimientoEquipo.jsx`, gráficas con Recharts (quién entrega más/a tiempo, estatus org-wide, carga por proyecto, tendencia semanal) sobre el mismo conjunto de entregables que ya ve cada quien vía `query_entregables_visibles`; filtro por proyecto y búsqueda por persona; toggles de mostrar/ocultar cada métrica (persistidos en localStorage). NO incluye "tareas rechazadas" (depende del flujo de "visto bueno", sin construir aún — ver pendiente abajo).
- ✅ Estilo Plan B "Dorado" (2026-08-26) — agregado al selector (Clásico/Grafito/Navy/Índigo/Salinas/Dorado): shell casi negro con acento dorado en gradiente, tarjetas/modales claros, avatares de color con iniciales (ya eran dinámicos vía `utils/avatarPersona.js`, no se tocó esa lógica).
- ⬜ **"Visto bueno" de tareas completadas** — plan completo aprobado por Yue el 2026-08-26 pero SIN IMPLEMENTAR: nuevo estatus `pendiente_aprobacion` al llegar a 100% (salvo autoasignación), acciones Aprobar/Rechazar restringidas a quien creó la tarea o N1/N2 del tema, equivalentes en `tools.py` (regla 7), migración Alembic. No asumir que se retomó solo porque se aprobó — confirmar con Yue antes de empezar.

**Reglas operativas que siguen vigentes** (no son historial, son cómo se
trabaja hoy):
- Dos stacks separados (laptop local vs. Raspberry Pi de producción, vía devtunnels `agenda-demo`/`agenda-ssh`) — el trabajo de una sesión no llega a la otra hasta un despliegue explícito (commit + push + `git pull` + `alembic upgrade head` + reiniciar `api` + rebuild de `web`).
- El contenedor `web` NO tiene hot-reload — todo cambio de frontend necesita `docker compose build web && up -d web`. El contenedor `api` sí tiene bind mount — basta reiniciarlo tras un cambio de backend.
- Antes de editar un `CheckConstraint`/`Enum` ya existente en una migración: revisar el `upgrade()` generado a mano, `alembic revision --autogenerate` no compara el cuerpo de un constraint que ya existía, solo detecta columnas/FKs/tablas nuevas.
- El asistente de voz (`tools.py`) tiene brechas conocidas sin cerrar: (1) notas sobre un tema/proyecto directamente (`agregar_nota` solo cubre reunión o entregable), (2) el dashboard "Rendimiento" (2026-08-26, ver arriba) — consultar métricas por voz aún no se evaluó. No construir nada nuevo en la UI sin evaluar si el asistente también lo necesita (regla 7, sección 0).
- El asistente de voz corre hoy con `ASISTENTE_LLM_PROVEEDOR=claude` en la Pi — si vuelve a fallar "no me entendió" en TODOS los intentos (no solo con nombres raros), sospecha primero de `CLAUDE_API_KEY` en `.env` antes que de la interpretación/NLU: `llm_cliente.py` envuelve `anthropic.APIError` en un mensaje genérico en español que oculta el error real (ej. un 401 quedó enmascarado así el 2026-08-26) — para depurar de verdad, correr una llamada directa a la API desde dentro del contenedor `api` en vez de confiar en el mensaje de error que llega a la UI.
- ✅ Notas/comentario en `SerieReunion` (2026-08-24, a petición de Yue: el campo "Notas" del modal desaparecía al elegir "Repetir") — columna `notas` nueva (migración `4500d682fc4c`), se copia a cada ocurrencia materializada y se sincroniza a las ocurrencias futuras al editar la serie.
- ✅ Recordatorio configurable por reunión (2026-08-25, a petición de Yue) — select "Sin recordatorio / 15 min / 30 min / 1 hora / 2 horas / 1 día antes" en ModalReunion.jsx, columna `recordatorio_minutos_antes` en `Reunion`/`SerieReunion` (migración `8c0cf388a430`), tipo de notificación nuevo `recordatorio_reunion` (una sola vez por reunión, distinto de `reunion_hoy` que es diario). Corrido por `generar_recordatorios_previos_reuniones` en el mismo scheduler de siempre. **Pendiente confirmado con Yue**: el scheduler sigue barriendo cada `horas_entre_barridos_recordatorios` (hasta 6h) — un recordatorio de "15/30 min antes" puede llegar tarde; antes de producción real hay que acortar ese intervalo (ej. cada 5-10 min) si se necesita precisión.
- ✅ Botón "Reagendar" en ModalReunion.jsx (2026-08-25, a petición de Yue) — solo enfoca/centra el campo de fecha para reprogramar rápido una reunión ya agendada (no aplica a la edición de una serie recurrente completa, ver más abajo).
- ✅ Auditoría de paridad asistente-de-voz vs. UI (2026-08-25, regla 7 sección 0) — se revisó el catálogo completo de `tools.py` contra la UI y se cerraron 5 brechas encontradas, en el orden acordado con Yue: (1) `agendar_reunion`/`crear_serie_reunion` ahora aceptan `notas` y `recordatorio` al crear por voz; (2) `editar_reunion` ahora también permite cambiar notas/recordatorio de una reunión individual ya creada; (3) se agregó `editar_serie_reunion` (no existía ningún tool para editar una junta recurrente ya creada por voz — solo se podía crear, había que borrar y recrear para cambiar día/hora/notas/recordatorio); (4) se agregó `dar_de_alta_persona` (envuelve el mismo servicio que ya usa POST /mi-equipo/nueva-persona en la UI — crea cuenta + la guarda en "Mi equipo", restringido a colaborador interno/externo, contraseña temporal por default); (5) se agregó `mover_item_agenda` (envuelve `mover_item_agenda` de `series_reunion.py` — sube/baja un ítem del checklist "Agenda de esta reunión"). El catálogo quedó en 33 acciones. Única brecha restante conocida: notas sobre un tema/proyecto directamente (hoy `agregar_nota` solo cubre reunión o entregable) — no priorizada, queda para cuando surja la necesidad.

- ✅ Reuniones de hoy ya no desaparecen antes de tiempo (2026-08-27, a petición de Yue) — `dashboard.py` (reuniones_proximas) y `MiSemana.jsx` usaban "ahora mismo"/`datetime.utcnow()` como cota inferior; se cambió a inicio del día de hoy, así que una reunión que ya empezó o a la que se le hizo tarde sigue disponible para tomarla o dejar notas el resto del día. Revierte a propósito la decisión del 2026-08-25 en `MiSemana.jsx` ("si ya son las 11am, ya se tomaron las anteriores").
- ✅ "Asignar tarea" desde una reunión en Agenda Plan B (2026-08-27) — botón en `ModalReunion.jsx` que reusa `ModalAsignarTareaRapida`, acotado a los participantes de esa reunión. Pendiente explícito: no cubre `CalendarioGlobal.jsx` (carga equipo distinto, sin `/mi-equipo`).
- ✅ Asistencia a reuniones (2026-08-27, a petición de Yue: "que quede registrado si alguien no llegó") — columna `asistio` (nullable) en `reunion_participantes` (migración `12e81284f2ec`), `PATCH /reuniones/{id}/participantes/{usuario_id}/asistencia`. Permiso: **cualquiera que pueda VER la reunión** (organizador, invitado, o N1/N2 del tema — `puede_ver_reunion`), no solo quien organiza — decisión explícita de Yue. UI en `ModalReunion.jsx`. Equivalente de voz agregado el mismo día: `registrar_asistencia` en `tools.py` (resuelve reunión + participante de ESA reunión + sí/no). Alcance: solo cubre invitados (`ReunionParticipante`), no al organizador (no tiene su propia fila de participante).
- ✅ Tono más "humano" en el asistente de voz y el chatbot (2026-08-27, a petición de Yue: "que no se sienta que hablo con una máquina") — dos cambios distintos: (1) los ~20 mensajes de confirmación en `tools.py` (`_ejecutar_*`) pasaron de plantillas tipo bitácora ("Entregable X creado correctamente") a frases tipo "Listo, ya quedó creado..."; (2) el `SYSTEM_PROMPT` de `chatbot.py` (usado también por `consultar_agenda`) ahora pide tono de colega platicando, no de reporte de sistema — explícitamente sin agregar relleno/cortesías vacías, la calidez es de redacción, no de longitud. **Pendiente evaluado y NO construido todavía** (ver sección 1, respuesta a Yue el 2026-08-27): cambiar la voz de salida (hoy `SpeechSynthesisUtterance` nativa del navegador, que es la parte que más "suena a máquina") por una síntesis neuronal local tipo Piper TTS — requiere nuevo servicio Docker en la Pi, no evaluado a fondo todavía, confirmar con Yue antes de empezar.
- ✅ Fix botón flotante del asistente de voz perdido al hacer zoom (2026-08-27) — `position: fixed` se ancla al viewport de layout, no al área visible real bajo zoom; `useFabAntizoom.js` reposiciona en tiempo real con `window.visualViewport`. Sin confirmar con pruebas reales de navegador (esta laptop no tiene Playwright/chromium-cli) — confirmado el razonamiento, pendiente que Yue lo pruebe en dispositivo real.
- ✅ Métricas de carga y tareas vencidas en "Rendimiento" (2026-08-27, a petición de Yue) — `rendimiento.py`/`RendimientoEquipo.jsx`: por persona ahora se calcula `vencidas` (activas con `fecha_entrega < hoy`), `dias_atraso_max`/`dias_atraso_promedio`, y `total_asignadas` (carga histórica completa, ya no solo la activa). Nueva gráfica "Tareas vencidas por persona" (toggle independiente) y toggle Carga activa/Total asignadas en la gráfica "Quién entrega más" — ambos ocultables como el resto de las métricas.
- ⬜ **Asignar tareas por WhatsApp** — piloto DELIBERADAMENTE acotado (aprobado por Yue el 2026-08-27, ver razonamiento en la sección "Para quién es esto"): puente de transición para quien hoy vive en WhatsApp, no reemplazo de la app. Código escrito (`app/routers/whatsapp_webhook.py`, nuevo, registrado en `main.py`) pero **SIN PROBAR** — esta laptop no tiene Python/Docker instalados, la validación de imports/arranque queda pendiente de correr en la Pi. Alcance v1: solo los números en `WHATSAPP_ASIGNADOR_TAREAS_TELEFONOS` (pensado para Bernardo únicamente) pueden ASIGNAR, solo la acción `crear_entregable` (reusa el mismo pipeline de `tools.py`/`interprete.py` del asistente de voz, sin NLU nueva), y el destinatario debe estar en el equipo directo de quien escribe (`listar_mi_equipo_efectivo`). Sin estado entre turnos: si falta un dato, se le pide a la persona reescribir el mensaje completo en vez de sostener una conversación.
  - Al responsable SIEMPRE le llega el WhatsApp de la tarea (a diferencia de la regla general del resto del sistema, que solo manda WhatsApp si es "urgente", ver `entregables.py::crear_entregable`) — decisión explícita de Yue el 2026-08-27, porque si la tarea se asignó por WhatsApp tiene sentido que la confirmación llegue por el mismo canal. Nota conocida: si la tarea también resulta urgente por la regla ya existente, el responsable puede recibir DOS WhatsApp (el genérico de siempre + este) — aceptado como limitación menor del piloto en vez de tocar la lógica de urgencia compartida por todos los canales.
  - **Completar tareas por WhatsApp** (mismo día, a petición de Yue) — el mensaje de asignación trae un código de referencia; responder `LISTO #<id>` marca la tarea al 100% (reusa `actualizar_avance`, mismo permiso real de siempre: responsable o N1/N2 del proyecto). A diferencia de "asignar", ESTO NO tiene allowlist — cualquier persona con `telefono_whatsapp` configurado puede completar sus propias tareas así, porque no abre ninguna puerta nueva de permisos, solo un canal nuevo para algo que ya podía hacer.
  - **Bloqueante externo confirmado por Yue**: hoy Twilio WhatsApp está en modo sandbox (solo salida antes de este cambio); recibir mensajes en producción requiere gestionar un número de WhatsApp Business con Twilio/Meta — trámite de cuenta, no de código. Para DEMO/piloto el sandbox alcanza, pero su sesión expira a los 3 días de inactividad (hay que re-mandar `join <código>`) — avisar antes de una demo en vivo. También pendiente: si el túnel no preserva el Host original, la validación de firma de Twilio necesita `WHATSAPP_WEBHOOK_URL_PUBLICA` configurada a mano (ver comentario en `config.py`).
  - **DESPLEGADO Y PROBADO en la Pi (2026-08-27/28)** — código sincronizado, `WHATSAPP_ASIGNADOR_TAREAS_TELEFONOS` configurado con el número de Bernardo, `telefono_whatsapp` de Bernardo (+5217774926483) y Juan José (+5217352212759) cargados directo en la base de datos (a petición explícita de Yue, saltándose "Mi perfil"). Backend arrancó sin errores, endpoint responde 403 sin firma válida (correcto). Falta que Yue configure el webhook en la consola de Twilio y una ambos números al sandbox antes de la prueba end-to-end real.
- ✅ **Pendientes personales** (2026-08-27/28, a petición de Yue: "pasar por leche", "pagar colegiatura de los niños" — cosas privadas que no son ni reuniones ni tareas de proyecto) — modelo nuevo `PendientePersonal` (tabla `pendientes_personales`, migración `3e87179608e3`), **100% privado, sin ninguna relación con proyecto/equipo** (a diferencia de TODO lo demás en el sistema) — el único criterio de acceso es `usuario_id == dueño`, por lo que `app/services/pendientes_personales.py` NO usa `app/core/permissions.py` a propósito. Checklist simple: contenido + fecha límite opcional + hecho, sin recordatorio con hora. En la UI, nuevo bloque "Mis pendientes" en `MiSemana.jsx`, dentro de la columna "Mi agenda" pero separado de las reuniones (no filtrado por semana, persiste hasta marcarse hecho). Equivalente de voz agregado en la misma tarea (regla 7, sección 0): `crear_pendiente_personal`, `completar_pendiente_personal`, `eliminar_pendiente_personal` en `tools.py` — catálogo del asistente ahora en 36 acciones.
  - **Nota para la próxima migración con autogenerate**: al generar `3e87179608e3` en la Pi, Alembic también detectó (drift no relacionado con esta tarea) que debería quitar la restricción única `suscripciones_push_endpoint_key` de `suscripciones_push` — se eliminó esa parte del archivo generado antes de aplicarlo, sin investigar la causa raíz. Si `suscripciones_push` sigue causando este mismo drift en una futura migración, vale la pena revisar por qué el modelo y la base de datos no coinciden ahí.
- ✅ Línea "Ahora" tipo Teams (2026-08-28, a petición de Yue) — `VistaSemana.jsx` (el Calendario) YA tenía la línea roja (`.vsem__linea-ahora`, desde el 2026-08-22) pero se quedaba congelada en la hora de apertura de la pantalla; se agregó un `setInterval` de 60s que la mueve sola mientras la pantalla sigue abierta. Además, en `MiSemana.jsx` ("Mi agenda", que es una LISTA por día, no una cuadrícula de horas, así que la línea de Teams no tiene una posición literal ahí) se agregó un divisor "Ahora" dentro del grupo de HOY, separando las reuniones ya pasadas de las que faltan — mismo espíritu, adaptado al layout de lista.
- **Migración de infraestructura en curso (2026-08-28, a petición de Yue)**: Yue está montando una segunda laptop (sin restricciones de instalación, a diferencia de esta) para que sea su "servidor" de desarrollo en vez de la Pi — planea apagar la Pi después. Ya se autorizó una llave SSH nueva (`yue-agenda-servidor-20260828`) en `~/.ssh/authorized_keys` de la Pi para esa laptop. Yue tiene un plan aparte (no compartido con esta sesión) para migrar la base de datos real antes de apagar la Pi -- **no asumir que ya se hizo o que no hace falta**, confirmar antes de dar por perdida cualquier necesidad de los datos reales de producción. Como esa laptop no puede instalar Docker (requiere admin), se le dio como alternativa un script de Whisper nativo (`faster-whisper` + Flask, mismo contrato HTTP que la imagen Docker) -- a petición de Yue, se mantuvo FUERA del repo compartido (solo se le pasó el contenido para que lo guarde localmente), no está en `scripts/` de este repo.

Antes de avanzar a algo fuera de esta lista, confirma con Yue.

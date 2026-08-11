# Agenda Inteligente de Proyectos — Documento de Diseño (Fase 0)

## 1. Contexto y alcance

MVP de una agenda/tablero de seguimiento de proyectos con roles por proyecto, histórico de avance, y notificaciones dentro de la app. Prueba con 4 proyectos y 7 usuarios (1 N1, 2 N2, 3 N3, 1 N4).

Fuera de alcance en este MVP (documentado para fases futuras): minutas con IA, notificaciones por correo/WhatsApp, chatbot, apps móviles.

---

## 2. Jerarquía de roles (por proyecto)

| Nivel | Rol | Visibilidad | Acciones |
|---|---|---|---|
| N1 | Dirección | Todos los proyectos y usuarios | Todo: crear proyectos, usuarios, roles, ver todo |
| N2 | Líder de Proyecto | Su(s) proyecto(s) + su equipo asignado dentro de esos proyectos | Crear/editar entregables, asignar tareas, marcar sensibilidad, ver histórico de su equipo |
| N3 | Colaborador Interno | Solo sus propios entregables + entregables no sensibles del proyecto | Actualizar su % avance, marcar cumplido, comentar |
| N4 | Colaborador Externo | Solo lo asignado explícitamente a él | Igual que N3, visibilidad reducida por defecto |

**Regla clave de sensibilidad:** un entregable marcado como `sensible = true` solo es visible para N1 y para el/los N2 que lo crearon o supervisan ese proyecto. N3/N4 nunca ven entregables sensibles, aunque sean del mismo proyecto en el que participan.

**Regla clave de jerarquía N2:** un N2 ve el avance de los N3/N4 que tiene asignados como su equipo en ese proyecto — no ve el equipo de otro N2 en el mismo proyecto.

---

## 3. Modelo de datos (ERD conceptual)

```
usuarios
├── id (PK)
├── nombre
├── email (único)
├── password_hash
├── activo (bool)
└── fecha_creacion

proyectos
├── id (PK)
├── nombre
├── descripcion
├── activo (bool)
└── fecha_creacion

usuario_proyecto_rol
├── id (PK)
├── usuario_id (FK -> usuarios)
├── proyecto_id (FK -> proyectos)
├── rol (enum: N1, N2, N3, N4)
├── supervisor_id (FK -> usuarios, nullable)  -- para saber a qué N2 reporta un N3/N4 en ESE proyecto
└── UNIQUE(usuario_id, proyecto_id)

entregables
├── id (PK)
├── proyecto_id (FK -> proyectos)
├── nombre
├── descripcion
├── responsable_id (FK -> usuarios)
├── fecha_entrega
├── porcentaje_avance (0-100)
├── estatus (enum: pendiente, en_progreso, cumplido)
├── sensible (bool, default false)
├── creado_por (FK -> usuarios)
└── fecha_creacion

historial_avance
├── id (PK)
├── entregable_id (FK -> entregables)
├── porcentaje_avance
├── actualizado_por (FK -> usuarios)
└── fecha_registro

notificaciones
├── id (PK)
├── usuario_id (FK -> usuarios)
├── entregable_id (FK -> entregables, nullable)
├── tipo (enum: recordatorio_proximo, recordatorio_vencido, otro)
├── mensaje
├── leida (bool, default false)
└── fecha_creacion
```

**Nota de diseño:** `supervisor_id` en `usuario_proyecto_rol` es la pieza que resuelve "N2 ve solo a su equipo" — cada N3/N4 queda ligado a un N2 específico dentro de cada proyecto.

---

## 4. Reglas de visibilidad (resumen para implementación)

```
Al consultar entregables de un proyecto para un usuario X:

SI rol(X, proyecto) == N1:
    devolver TODOS los entregables del proyecto

SI rol(X, proyecto) == N2:
    devolver entregables donde:
        responsable pertenece al equipo de X (supervisor_id == X.id)
        O responsable == X
        (sensibles incluidos, porque N2 sí ve sensibles de su propio equipo)

SI rol(X, proyecto) == N3 o N4:
    devolver entregables donde:
        responsable_id == X.id
        O (proyecto == mismo Y sensible == false)
```

---

## 5. Endpoints propuestos (API REST)

### Auth
- `POST /auth/login` → devuelve JWT
- `GET /auth/me` → datos del usuario autenticado + sus roles por proyecto

### Usuarios (solo N1)
- `GET /usuarios`
- `POST /usuarios`
- `PATCH /usuarios/{id}`

### Proyectos
- `GET /proyectos` → filtrado según rol del usuario
- `POST /proyectos` (solo N1)
- `GET /proyectos/{id}`
- `PATCH /proyectos/{id}` (N1/N2)

### Asignación de roles por proyecto
- `POST /proyectos/{id}/usuarios` → asigna usuario + rol + supervisor (N1/N2)
- `GET /proyectos/{id}/usuarios` → lista equipo del proyecto (filtrado por rol de quien consulta)

### Entregables
- `GET /proyectos/{id}/entregables` → filtrado según reglas de visibilidad (sección 4)
- `POST /proyectos/{id}/entregables` (N1/N2)
- `PATCH /entregables/{id}` (responsable actualiza % avance; N1/N2 puede editar todo)
- `GET /entregables/{id}/historial`

### Notificaciones
- `GET /notificaciones` → del usuario autenticado
- `PATCH /notificaciones/{id}` → marcar como leída

### Resumen ejecutivo (N1/N2)
- `GET /proyectos/{id}/resumen` → % avance global, entregables vencidos, próximos a vencer

---

## 6. Wireframes básicos (descripción funcional)

### Vista 1 — Tablero de Proyecto (estilo semáforo)
```
[Proyecto: Nombre]                          [% avance global: 62%]
--------------------------------------------------------------
| Entregable      | Responsable | Fecha    | Avance | Estatus |
--------------------------------------------------------------
| Flujo de datos  | (usuario)   | 05-ago   | 80%    | 🟢      |
| Documento X     | (usuario)   | 06-ago   | 30%    | ⬜      |
| [🔒 Sensible]    | (usuario)   | 07-ago   | 100%   | 🟢      |
--------------------------------------------------------------
```
Solo N1/N2 ven fila de "Sensible" con candado si aplica.

### Vista 2 — Mis Pendientes (para cualquier rol)
```
[Mis entregables]
- Flujo de datos — vence en 1 día — 80% [actualizar avance ▾]
- Documento X — vence en 2 días — 30% [actualizar avance ▾]
```
Notificación in-app visible arriba: "🔔 Tienes 1 entregable que vence mañana"

### Vista 3 — Resumen Ejecutivo (N1/N2)
```
[Resumen general]
Proyecto A: 62% avance | 2 vencidos | 3 próximos a vencer
Proyecto B: 40% avance | 0 vencidos | 1 próximo a vencer
...
[Ver histórico de avance por proyecto: gráfica línea de % a través del tiempo]
```

---

## 7. Stack técnico confirmado
- Backend: Python + FastAPI
- Base de datos: PostgreSQL
- Frontend: React
- Auth: JWT
- Entorno inicial: local (VS Code + Claude Code) → migración futura a AWS
- Todo dockerizado desde el inicio

---

## 8. Siguientes pasos (tras aprobación de este documento)
1. Fase 1: Backend base (modelos, auth, CRUD, reglas de visibilidad)
2. Fase 2: Frontend base (login, tablero, mis pendientes)
3. Fase 3: Resumen ejecutivo + notificaciones in-app
4. Fase 4: Carga de datos de prueba (7 usuarios, 4 proyectos) + demo al cliente

---
name: ui-ux-design
description: Aplica identidad visual y criterios de UI/UX consistentes (paleta teal/navy tipo dashboard SaaS por defecto, con override por proyecto) al construir o rediseñar interfaces en React/Vite. Úsala al crear componentes, layouts, dashboards, o cualquier pantalla nueva; y al dar feedback de diseño sobre una interfaz existente.
---

# UI/UX Design — identidad personal

Actúa como el diseñador de cabecera de mis proyectos: cada interfaz debe sentirse parte de una misma familia visual, salvo que el proyecto pida explícitamente algo distinto.

## Paleta por defecto (teal/navy — dashboard/SaaS)

Si el proyecto no especifica lo contrario, usa esta base como punto de partida (ajusta tonos exactos según el brief, pero mantén la lógica teal + navy):

- **Navy profundo** (`#0F1B2D` aprox.) — fondos oscuros, sidebar, headers
- **Teal primario** (`#0D9488` / `#14B8A6` aprox.) — acciones principales, acentos, estados activos
- **Navy medio** (`#1E293B` aprox.) — superficies secundarias, cards sobre fondo oscuro
- **Gris frío neutro** (`#64748B` aprox.) — texto secundario, bordes, íconos inactivos
- **Blanco/gris muy claro** (`#F8FAFC` aprox.) — fondos claros, texto sobre navy
- **Acento de estado** (verde éxito, ámbar advertencia, rojo error) — nunca reemplazan al teal como color de marca, solo se usan para estado

### Cuándo hacer override
Si el brief pide explícitamente otra identidad (cliente externo, producto con marca propia, experimento visual), ignora esta paleta y documenta la nueva al inicio del trabajo: 4–6 hex con su rol (igual que abajo). No mezcles ambas paletas en un mismo proyecto.

## Tipografía

Aún no hay librería de componentes fijada — mientras tanto:
- Define explícitamente una tipografía de display (headers, cifras destacadas) y una de texto (body/UI), no uses la misma familia para ambas
- Escala tipográfica clara y consistente (ej. 12/14/16/20/24/32/48px), no valores arbitrarios por componente
- Los datos numéricos importantes (métricas de dashboard, cifras destacadas) usan una fuente monoespaciada o tabular para alinear dígitos

## Layout — patrón dashboard/SaaS

- Sidebar fija o colapsable en navy, contenido principal sobre fondo claro
- Cards con jerarquía clara: título, métrica/contenido, estado, acción secundaria
- Espaciado consistente en base 4/8px, nunca márgenes arbitrarios
- Estructura responsive obligatoria: sidebar colapsa a menú en mobile, cards se apilan en una columna

## Componentes

Como aún no defines librería fija:
- Si el proyecto ya usa una (Tailwind, shadcn/ui, MUI, etc.), sigue sus convenciones y no mezcles con otra
- Si no hay ninguna decidida, propón Tailwind + shadcn/ui como default razonable (control total del markup, fácil de themear con la paleta teal/navy) y dilo explícitamente antes de generar código, dando oportunidad de cambiarlo

## Accesibilidad — piso mínimo no negociable

- Contraste AA mínimo texto/fondo (cuidado especial con teal claro sobre blanco y gris sobre navy — verificar, no asumir)
- Foco de teclado visible en todo elemento interactivo
- Estados hover/focus/active/disabled diferenciados visualmente, no solo por color
- Reduced motion respetado en animaciones

## Copy y microcopy

- Voz activa: "Guardar cambios", no "Enviar"
- Nombrar por lo que la persona reconoce, no por cómo está construido el sistema (ej. "Notificaciones", no "Webhook config")
- Mensajes de error explican qué pasó y cómo resolverlo, sin disculpas ni ambigüedad
- Estados vacíos son una invitación a actuar, no solo un mensaje pasivo

## Proceso

1. Si el brief no fija paleta, aplica la de este documento sin preguntar
2. Antes de generar código, resume en una línea: paleta, tipografía elegida, librería de componentes a usar
3. Construye siguiendo ese resumen; si algo se desvía en el camino, dilo explícitamente
4. Revisa el resultado contra el piso de accesibilidad antes de darlo por terminado

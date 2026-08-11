---
name: ui-ux-design
description: Aplica identidad visual y criterios de UI/UX consistentes (paleta teal/navy tipo dashboard SaaS por defecto, con override por proyecto) al construir o rediseñar interfaces en React/Vite. Úsala al crear componentes, layouts, dashboards, o cualquier pantalla nueva; y al dar feedback de diseño sobre una interfaz existente.
---

# UI/UX Design — identidad personal

Actúa como el diseñador de cabecera de mis proyectos: cada interfaz debe sentirse parte de una misma familia visual, salvo que el proyecto pida explícitamente algo distinto.

## Paleta por defecto (teal/navy — dashboard/SaaS)

Estos son valores FIJOS, ya en uso real en este proyecto (`agenda-frontend/src/styles/tokens.css`) — no los reinterpretes ni generes tonos "parecidos". Si tocas frontend aquí, usa esas variables directamente (`--color-navy-900`, `--color-teal-500`, etc.); no declares custom properties nuevas que las dupliquen:

```css
:root{
  --color-navy-900:#0F2438;   /* fondos oscuros, sidebar, headers */
  --color-navy-700:#1C3A52;   /* superficies secundarias, cards sobre fondo oscuro */
  --color-teal-500:#1F8A8C;   /* acciones principales, acentos, estados activos */
  --color-teal-600:#146D6F;   /* botones primarios, hover más oscuro */
  --color-text-muted:#5B6B78; /* texto secundario, íconos inactivos */
  --color-border:#E2E6EA;
  --color-bg:#F7F8FA;         /* fondo claro, superficie principal */
  --color-surface:#FFFFFF;
  --color-success:#1F8A5C;    /* solo para estado, nunca como color de marca */
  --color-warning:#B5790A;    /* solo para estado */
  --color-danger:#C0392B;     /* solo para estado / urgente */
}
```

En un proyecto nuevo sin `tokens.css` propio, copia este bloque `:root` tal cual al CSS global antes de construir componentes. No declares colores nuevos por componente; todo debe consumir estas variables.

### Cuándo hacer override
Si el brief pide explícitamente otra identidad (cliente externo, producto con marca propia, experimento visual), ignora esta paleta y documenta la nueva al inicio del trabajo: 4–6 hex con su rol (igual que arriba). No mezcles ambas paletas en un mismo proyecto.

## Tipografía

Fijas por defecto, ya en uso en `tokens.css` (`--font-display`, `--font-body`):
- Display/headers: `Sora` (600–700)
- Body/UI: `Inter` (400–600)

- Escala tipográfica clara y consistente (ej. 12/14/16/20/24/32/48px), no valores arbitrarios por componente
- Los datos numéricos importantes (métricas de dashboard, cifras destacadas) idealmente usan una fuente monoespaciada o tabular para alinear dígitos — este proyecto todavía no tiene una fijada en `tokens.css`; si vas a introducir una (ej. `JetBrains Mono`), dilo explícitamente antes de agregarla, igual que con cualquier dependencia nueva

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

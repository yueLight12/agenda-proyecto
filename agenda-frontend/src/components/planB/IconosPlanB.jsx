// Iconos de línea (SVG, stroke=currentColor) usados solo por el diseño
// "nuevo" de Agenda Plan B (2026-08-21, a petición de Yue: réplica exacta
// de las imágenes de referencia, que usan iconos de línea en un solo color
// de acento, no emoji de colores). El diseño "clásico" sigue usando emoji
// (ver TarjetasAsignar.jsx) -- estos componentes solo se montan cuando el
// diseño nuevo está activo.
const props = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export function IconoTarea() {
  return (
    <svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.4 2.4L15.8 9.6" />
    </svg>
  );
}

export function IconoProyecto() {
  return (
    <svg {...props}>
      <path d="M3.5 8.2c0-.9.7-1.6 1.6-1.6h4l1.8 1.8h7.1c.9 0 1.6.7 1.6 1.6v7.4c0 .9-.7 1.6-1.6 1.6H5.1c-.9 0-1.6-.7-1.6-1.6V8.2z" />
      <path d="M12 12v4M10 14h4" />
    </svg>
  );
}

export function IconoPersona() {
  return (
    <svg {...props}>
      <circle cx="10" cy="8.5" r="3.5" />
      <path d="M3.5 19c.7-3 3.3-5 6.5-5s5.8 2 6.5 5" />
      <path d="M18.5 8.5v4M16.5 10.5h4" />
    </svg>
  );
}

export function IconoAgenda() {
  return (
    <svg {...props}>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 9.5h17M8 3v3.5M16 3v3.5" />
    </svg>
  );
}

export function IconoRendimiento() {
  return (
    <svg {...props}>
      <path d="M4 20V10M11 20V4M18 20v-7" />
      <path d="M3.5 20.5h17" />
    </svg>
  );
}

export function IconoCheck() {
  return (
    <svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.4 2.4L15.8 9.6" />
    </svg>
  );
}

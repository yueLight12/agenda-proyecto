const ETIQUETAS = {
  cumplido: "Cumplido",
  en_progreso: "En progreso",
  pendiente: "Pendiente",
};

export default function EstatusBadge({ estatus }) {
  return <span className={`badge badge--${estatus}`}>{ETIQUETAS[estatus] || estatus}</span>;
}

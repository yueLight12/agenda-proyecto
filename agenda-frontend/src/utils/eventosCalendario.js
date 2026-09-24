// Color por tipo de evento normalizado (resource.tipo), compartido entre
// las vistas Mes/Semana/Día de react-big-calendar (CalendarioEntregables.jsx)
// y la vista de lista (VistaAgendaSemanal.jsx), para que ambas pinten
// exactamente igual sin duplicar la lógica.
const COLOR_ESTATUS = {
  pendiente: "var(--color-text-muted)",
  en_progreso: "var(--color-warning)",
  cumplido: "var(--color-success)",
};

export function colorDeEvento(evento) {
  if (evento.resource.tipo === "reunion") {
    return "var(--color-navy-700, #2f4a5c)";
  }
  if (evento.resource.tipo === "evento_empresa") {
    return "var(--color-teal-500)";
  }
  // Ausencia aprobada (2026-09-23) -- morado, para distinguirla de un
  // entregable/reunión/evento de empresa a simple vista.
  if (evento.resource.tipo === "ausencia") {
    return "var(--color-purple-500, #7c5cbf)";
  }
  return COLOR_ESTATUS[evento.resource.datos.estatus] || COLOR_ESTATUS.pendiente;
}

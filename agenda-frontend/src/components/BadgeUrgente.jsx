// Badge "URGENTE" (2026-08-20, a petición del cliente): se muestra junto
// al badge de estatus de un entregable cuando entregable.urgente es true
// (calculado en el servidor, ver
// app/services/entregables.py::es_urgente -- manual OR vencido OR vence
// en ≤3 días). Nunca reemplaza el badge de estatus, se agrega al lado.
export default function BadgeUrgente({ urgente }) {
  if (!urgente) return null;
  return <span className="badge badge--urgente">URGENTE</span>;
}

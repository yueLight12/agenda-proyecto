// Detección/ajuste de fin de semana (2026-09-02, a petición de Yue: antes de
// guardar una reunión o una tarea con fecha en sábado/domingo, preguntar si
// de verdad se quiere esa fecha o moverla al día hábil más cercano -- viernes
// si es sábado, lunes si es domingo). Solo cubre reuniones y entregables por
// ahora (alcance confirmado por Yue) -- pendientes personales quedan fuera.

export function esFinDeSemana(fechaStr) {
  if (!fechaStr) return false;
  const dia = new Date(`${fechaStr}T00:00:00`).getDay(); // 0 domingo, 6 sábado
  return dia === 0 || dia === 6;
}

// null si `fechaStr` no cae en fin de semana.
export function nombreDiaFinDeSemana(fechaStr) {
  const dia = new Date(`${fechaStr}T00:00:00`).getDay();
  if (dia === 6) return "sábado";
  if (dia === 0) return "domingo";
  return null;
}

// Sábado -> viernes (un día antes), domingo -> lunes (un día después).
export function diaHabilMasCercano(fechaStr) {
  const d = new Date(`${fechaStr}T00:00:00`);
  const dia = d.getDay();
  if (dia === 6) d.setDate(d.getDate() - 1);
  else if (dia === 0) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

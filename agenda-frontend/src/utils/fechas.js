// `fecha_entrega` llega del backend como "YYYY-MM-DD" — se arma con
// componentes locales (no `new Date(fecha)` directo) para no perder un día
// por el corrimiento a UTC.
export function fechaLocal(fechaIso) {
  const [anio, mes, dia] = fechaIso.split("-").map(Number);
  return new Date(anio, mes - 1, dia);
}

export function textoDiasRelativos(fechaIso) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const diffDias = Math.round((fechaLocal(fechaIso) - hoy) / (1000 * 60 * 60 * 24));
  if (diffDias === 0) return "hoy";
  if (diffDias > 0) return `en ${diffDias} día${diffDias === 1 ? "" : "s"}`;
  const dias = -diffDias;
  return `hace ${dias} día${dias === 1 ? "" : "s"}`;
}

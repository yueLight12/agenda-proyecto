// Timestamps que el backend genera con `datetime.utcnow()` (fecha_leida,
// fecha_creacion de notas/mensajes, etc.) llegan como ISO SIN sufijo de
// zona horaria (ej. "2026-09-22T15:30:00.123456") -- son hora UTC, pero
// como el texto no trae "Z" ni offset, `new Date(...)` del navegador los
// interpreta como si YA fueran hora local, adelantando el reloj 6 horas
// en México (bug real reportado 2026-09-22, Beatriz Saavedra: "¿por qué
// dice que lo revisó a las 3pm si apenas son las 11?"). Se antepone "Z"
// solo si el string no trae ya su propia zona, para no romper el día que
// el backend empiece a mandarla.
export function fechaUtcComoLocal(iso) {
  if (!iso) return null;
  const tieneZona = /Z$|[+-]\d{2}:?\d{2}$/.test(iso);
  return new Date(tieneZona ? iso : `${iso}Z`);
}

// `fecha_entrega` llega del backend como "YYYY-MM-DD" — se arma con
// componentes locales (no `new Date(fecha)` directo) para no perder un día
// por el corrimiento a UTC.
export function fechaLocal(fechaIso) {
  const [anio, mes, dia] = fechaIso.split("-").map(Number);
  return new Date(anio, mes - 1, dia);
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

// Semana ISO 8601 (lunes a domingo, mismo criterio que dia_semana=0 en
// SerieReunion) que contiene `hoy` -- para el encabezado "Minuta-Semana N"
// de Vista Equipo.
export function semanaActual(hoy = new Date()) {
  const diaSemana = (hoy.getDay() + 6) % 7; // 0=lunes...6=domingo
  const inicio = new Date(hoy);
  inicio.setHours(0, 0, 0, 0);
  inicio.setDate(hoy.getDate() - diaSemana);
  const fin = new Date(inicio);
  fin.setDate(inicio.getDate() + 6);

  const d = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));
  const diaIso = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - diaIso);
  const inicioAnio = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const numero = Math.ceil(((d - inicioAnio) / 86400000 + 1) / 7);

  return { numero, inicio, fin };
}

export function textoRangoSemana({ inicio, fin }) {
  const mismoMes = inicio.getMonth() === fin.getMonth();
  const mesFin = MESES[fin.getMonth()];
  if (mismoMes) {
    return `${inicio.getDate()} al ${fin.getDate()} de ${mesFin}`;
  }
  return `${inicio.getDate()} de ${MESES[inicio.getMonth()]} al ${fin.getDate()} de ${mesFin}`;
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

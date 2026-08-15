import startOfWeek from "date-fns/startOfWeek";
import endOfWeek from "date-fns/endOfWeek";
import addWeeks from "date-fns/addWeeks";
import format from "date-fns/format";
import es from "date-fns/locale/es";

const MIN_SEMANAS = 4;
const MAX_SEMANAS = 12;
const MS_POR_SEMANA = 7 * 24 * 60 * 60 * 1000;

function inicioDelDia(fecha) {
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  return d;
}

function esMismoDia(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function claveMesDe(fecha) {
  return `${fecha.getFullYear()}-${fecha.getMonth()}`;
}

/**
 * Agrupa los eventos ya normalizados de CalendarioEntregables.jsx (cada uno
 * con {start, resource}) en un array plano de filas heterogéneas, listo
 * para .map() en VistaAgendaSemanal.jsx:
 *  - {tipo:"mes_banner", fecha}    al cruzar a un mes calendario nuevo
 *  - {tipo:"semana_vacia", inicio, fin}  una semana sin eventos ni "hoy"
 *  - {tipo:"dia", fecha, esHoy, eventos} un día con eventos (o "hoy" vacío)
 *
 * Solo muestra desde hoy hacia adelante. Ventana mínima de 4 semanas (para
 * no verse vacío) y tope de 12 (una lista más larga por un solo entregable
 * lejano no aporta — para eso siguen las vistas Mes/Semana/Día).
 */
export function agruparEventosEnFilas(eventos, hoy = new Date()) {
  const hoyDia = inicioDelDia(hoy);
  const eventosFuturos = eventos.filter((e) => inicioDelDia(e.start) >= hoyDia);

  const inicioSemanaHoy = startOfWeek(hoyDia, { locale: es });

  let ultimaSemanaConEvento = inicioSemanaHoy;
  eventosFuturos.forEach((e) => {
    const inicioSemanaEvento = startOfWeek(inicioDelDia(e.start), { locale: es });
    if (inicioSemanaEvento > ultimaSemanaConEvento) ultimaSemanaConEvento = inicioSemanaEvento;
  });

  const semanasConEventos =
    Math.round((ultimaSemanaConEvento - inicioSemanaHoy) / MS_POR_SEMANA) + 1;
  const numSemanas = Math.max(MIN_SEMANAS, Math.min(MAX_SEMANAS, semanasConEventos));

  const filas = [];
  let mesAnterior = null;

  for (let i = 0; i < numSemanas; i++) {
    const inicioSemana = addWeeks(inicioSemanaHoy, i);
    const finSemana = endOfWeek(inicioSemana, { locale: es });

    const diasConEventos = new Map();
    eventosFuturos
      .filter((e) => {
        const dia = inicioDelDia(e.start);
        return dia >= inicioSemana && dia <= finSemana;
      })
      .forEach((e) => {
        const dia = inicioDelDia(e.start);
        const clave = dia.getTime();
        if (!diasConEventos.has(clave)) diasConEventos.set(clave, { fecha: dia, eventos: [] });
        diasConEventos.get(clave).eventos.push(e);
      });

    const hoyEnEstaSemana = hoyDia >= inicioSemana && hoyDia <= finSemana;
    if (hoyEnEstaSemana && !diasConEventos.has(hoyDia.getTime())) {
      diasConEventos.set(hoyDia.getTime(), { fecha: hoyDia, eventos: [] });
    }

    const filasDeLaSemana =
      diasConEventos.size === 0
        ? [{ tipo: "semana_vacia", inicio: inicioSemana, fin: finSemana }]
        : Array.from(diasConEventos.values())
            .sort((a, b) => a.fecha - b.fecha)
            .map(({ fecha, eventos: eventosDia }) => ({
              tipo: "dia",
              fecha,
              esHoy: esMismoDia(fecha, hoyDia),
              eventos: eventosDia.sort((a, b) => a.start - b.start),
            }));

    filasDeLaSemana.forEach((fila) => {
      const fechaFila = fila.tipo === "semana_vacia" ? fila.inicio : fila.fecha;
      const claveMes = claveMesDe(fechaFila);
      if (claveMes !== mesAnterior) {
        filas.push({ tipo: "mes_banner", fecha: fechaFila });
        mesAnterior = claveMes;
      }
      filas.push(fila);
    });
  }

  return filas;
}

export function formatearRangoSemana(inicio, fin) {
  if (inicio.getMonth() === fin.getMonth()) {
    return `${format(inicio, "d")}–${format(fin, "d 'de' MMM", { locale: es })}`;
  }
  return `${format(inicio, "d 'de' MMM", { locale: es })}–${format(fin, "d 'de' MMM", { locale: es })}`;
}

export function formatearMes(fecha) {
  return format(fecha, "MMMM 'de' yyyy", { locale: es });
}

export function formatearDia(fecha) {
  return format(fecha, "EEEE d", { locale: es });
}

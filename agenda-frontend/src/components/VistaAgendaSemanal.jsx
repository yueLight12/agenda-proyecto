import format from "date-fns/format";
import es from "date-fns/locale/es";
import { agruparEventosEnFilas, formatearRangoSemana, formatearMes } from "../utils/agendaSemanal";
import { colorDeEvento } from "../utils/eventosCalendario";

function capitalizar(texto) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function abreviarDiaSemana(fecha) {
  return format(fecha, "EEE", { locale: es }).replace(/\.$/, "");
}

/**
 * Vista tipo "Agenda" de Google Calendar: lista vertical agrupada por
 * semana, con un banner de mes al cruzar a un mes calendario nuevo. Solo
 * muestra desde hoy hacia adelante (agruparEventosEnFilas se encarga del
 * filtro/agrupación). Recibe los mismos eventos ya normalizados y los
 * mismos handlers de click que CalendarioEntregables.jsx usa para
 * Mes/Semana/Día, así que abre exactamente los mismos modales.
 */
export default function VistaAgendaSemanal({
  eventos,
  onEntregableClick,
  onReunionClick,
  onEventoEmpresaClick,
  onDiaClick,
}) {
  const filas = agruparEventosEnFilas(eventos);

  const manejarClick = (evento) => {
    if (evento.resource.tipo === "reunion") onReunionClick?.(evento.resource.datos);
    else if (evento.resource.tipo === "entregable") onEntregableClick?.(evento.resource.datos);
    else if (evento.resource.tipo === "evento_empresa") onEventoEmpresaClick?.(evento.resource.datos);
  };

  return (
    <div className="agenda-semanal">
      {filas.map((fila, indice) => {
        if (fila.tipo === "mes_banner") {
          return (
            <h3 key={`mes-${indice}`} className="mes-banner">
              {capitalizar(formatearMes(fila.fecha))}
            </h3>
          );
        }

        if (fila.tipo === "semana_vacia") {
          return (
            <div key={`semana-${indice}`} className="agenda-semana-vacia">
              {formatearRangoSemana(fila.inicio, fila.fin)}
            </div>
          );
        }

        return (
          <div key={`dia-${indice}`} className="agenda-dia">
            {onDiaClick ? (
              <button
                type="button"
                className="agenda-dia__fecha agenda-dia__fecha--tocable"
                onClick={() => onDiaClick(fila.fecha)}
                aria-label={`Nueva reunión el ${format(fila.fecha, "d 'de' MMMM", { locale: es })}`}
              >
                <span>{abreviarDiaSemana(fila.fecha)}</span>
                <span className={fila.esHoy ? "agenda-dia__circulo-hoy" : "agenda-dia__numero"}>
                  {format(fila.fecha, "d")}
                </span>
              </button>
            ) : (
              <div className="agenda-dia__fecha">
                <span>{abreviarDiaSemana(fila.fecha)}</span>
                <span className={fila.esHoy ? "agenda-dia__circulo-hoy" : "agenda-dia__numero"}>
                  {format(fila.fecha, "d")}
                </span>
              </div>
            )}
            <div className="agenda-dia__eventos">
              {fila.eventos.length === 0 ? (
                <span className="agenda-sin-planes">No tienes planes.</span>
              ) : (
                fila.eventos.map((evento) => (
                  <button
                    key={evento.id}
                    type="button"
                    className="agenda-evento-pill"
                    style={{ backgroundColor: colorDeEvento(evento) }}
                    onClick={() => manejarClick(evento)}
                  >
                    {evento.title}
                  </button>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

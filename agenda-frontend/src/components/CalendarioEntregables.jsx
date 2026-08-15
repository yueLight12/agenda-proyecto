import { useState } from "react";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import format from "date-fns/format";
import parse from "date-fns/parse";
import startOfWeek from "date-fns/startOfWeek";
import getDay from "date-fns/getDay";
import es from "date-fns/locale/es";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import { colorDeEvento } from "../utils/eventosCalendario";
import VistaAgendaSemanal from "./VistaAgendaSemanal";

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { locale: es }),
  getDay,
  locales: { es },
});

const CalendarioDnD = withDragAndDrop(Calendar);

const MENSAJES_ES = {
  next: "Sig.",
  previous: "Ant.",
  today: "Hoy",
  month: "Mes",
  week: "Semana",
  day: "Día",
  agenda: "Agenda",
  noEventsInRange: "No hay entregables en este rango.",
};

function fechaLocalDesdeISO(fechaISO) {
  const [anio, mes, dia] = fechaISO.split("-").map(Number);
  return new Date(anio, mes - 1, dia);
}

function isoDesdeFechaLocal(fecha) {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

/**
 * Calendario reutilizable de entregables. `puedeEditar(entregable)` decide,
 * por entregable, si puede arrastrarse para reprogramar (respeta permisos
 * N1/N2 ya resueltos por quien use este componente).
 */
const ICONO_TIPO_EVENTO_EMPRESA = {
  cumpleanos: "🎂",
  festivo: "📌",
  evento: "🎉",
};

export default function CalendarioEntregables({
  entregables,
  reuniones = [],
  eventosEmpresa = [],
  editable = false,
  puedeEditar = () => true,
  onReprogramar,
  onEntregableClick,
  onReunionClick,
  onEventoEmpresaClick,
}) {
  const [error, setError] = useState("");

  // La vista "Mes" es una cuadrícula de 7 columnas — no cabe en una
  // pantalla de celular sin scroll horizontal. En pantallas ≤768px (mismo
  // umbral que el drawer del sidebar, ver AppLayout.jsx) arranca en
  // "Agenda" (lista vertical, sin cuadrícula) en vez de "Mes". El usuario
  // puede seguir cambiando de vista manualmente con el toolbar.
  const [vista, setVista] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches
      ? "agenda"
      : "month"
  );

  const eventosEntregables = entregables.map((e) => {
    const fecha = fechaLocalDesdeISO(e.fecha_entrega);
    return {
      id: `entregable-${e.id}`,
      title: e.proyecto_nombre ? `${e.nombre} — ${e.proyecto_nombre}` : e.nombre,
      start: fecha,
      end: fecha,
      allDay: true,
      resource: { tipo: "entregable", datos: e },
    };
  });

  const eventosReuniones = reuniones.map((r) => {
    const inicio = new Date(r.fecha_inicio);
    const fin = new Date(inicio.getTime() + r.duracion_minutos * 60000);
    return {
      id: `reunion-${r.id}`,
      title: r.proyecto_nombre ? `📅 ${r.titulo} — ${r.proyecto_nombre}` : `📅 ${r.titulo}`,
      start: inicio,
      end: fin,
      allDay: false,
      resource: { tipo: "reunion", datos: r },
    };
  });

  const eventosDeEmpresa = eventosEmpresa.map((e) => {
    const fecha = fechaLocalDesdeISO(e.fecha);
    const icono = ICONO_TIPO_EVENTO_EMPRESA[e.tipo] || "🎉";
    return {
      id: `evento-empresa-${e.id}`,
      title: `${icono} ${e.nombre}`,
      start: fecha,
      end: fecha,
      allDay: true,
      resource: { tipo: "evento_empresa", datos: e },
    };
  });

  const eventos = [...eventosEntregables, ...eventosReuniones, ...eventosDeEmpresa];

  const eventPropGetter = (evento) => ({
    style: {
      backgroundColor: colorDeEvento(evento),
      borderRadius: 4,
      border: "none",
    },
  });

  const handleEventDrop = async ({ event, start }) => {
    if (event.resource.tipo !== "entregable") return;
    const entregable = event.resource.datos;
    if (!editable || !puedeEditar(entregable)) return;
    setError("");
    try {
      await onReprogramar(entregable, isoDesdeFechaLocal(start));
    } catch {
      setError(`No se pudo reprogramar "${entregable.nombre}".`);
    }
  };

  return (
    <div className="stack">
      {error && <p className="error-text">{error}</p>}
      <div
        className={`calendar-responsive${vista === "agenda" ? " calendar-responsive--agenda" : ""}`}
        style={{ height: 600, overflowY: "auto" }}
      >
        {vista === "agenda" ? (
          <>
            <div className="agenda-semanal__header">
              {["month", "week", "day", "agenda"].map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`btn ${vista === v ? "btn--primary" : "btn--ghost"}`}
                  onClick={() => setVista(v)}
                >
                  {MENSAJES_ES[v]}
                </button>
              ))}
            </div>
            <VistaAgendaSemanal
              eventos={eventos}
              onEntregableClick={onEntregableClick}
              onReunionClick={onReunionClick}
              onEventoEmpresaClick={onEventoEmpresaClick}
            />
          </>
        ) : (
          <CalendarioDnD
            localizer={localizer}
            events={eventos}
            culture="es"
            messages={MENSAJES_ES}
            view={vista}
            onView={setVista}
            startAccessor="start"
            endAccessor="end"
            eventPropGetter={eventPropGetter}
            draggableAccessor={(evento) =>
              evento.resource.tipo === "entregable" && editable && puedeEditar(evento.resource.datos)
            }
            resizable={false}
            onEventDrop={handleEventDrop}
            onSelectEvent={(evento) => {
              if (evento.resource.tipo === "reunion") onReunionClick?.(evento.resource.datos);
              else if (evento.resource.tipo === "entregable") onEntregableClick?.(evento.resource.datos);
              else if (evento.resource.tipo === "evento_empresa") onEventoEmpresaClick?.(evento.resource.datos);
            }}
          />
        )}
      </div>
    </div>
  );
}

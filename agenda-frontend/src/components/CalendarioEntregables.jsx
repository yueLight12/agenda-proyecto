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

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { locale: es }),
  getDay,
  locales: { es },
});

const CalendarioDnD = withDragAndDrop(Calendar);

const COLOR_ESTATUS = {
  pendiente: "var(--color-text-muted)",
  en_progreso: "var(--color-warning)",
  cumplido: "var(--color-success)",
};

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
export default function CalendarioEntregables({
  entregables,
  reuniones = [],
  editable = false,
  puedeEditar = () => true,
  onReprogramar,
  onEntregableClick,
  onReunionClick,
}) {
  const [error, setError] = useState("");

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

  const eventos = [...eventosEntregables, ...eventosReuniones];

  const eventPropGetter = (evento) => {
    if (evento.resource.tipo === "reunion") {
      return {
        style: {
          backgroundColor: "var(--color-navy-700, #2f4a5c)",
          borderRadius: 4,
          border: "none",
        },
      };
    }
    return {
      style: {
        backgroundColor: COLOR_ESTATUS[evento.resource.datos.estatus] || COLOR_ESTATUS.pendiente,
        borderRadius: 4,
        border: "none",
      },
    };
  };

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
      <div className="calendar-responsive" style={{ height: 600 }}>
        <CalendarioDnD
          localizer={localizer}
          events={eventos}
          culture="es"
          messages={MENSAJES_ES}
          startAccessor="start"
          endAccessor="end"
          eventPropGetter={eventPropGetter}
          draggableAccessor={(evento) =>
            evento.resource.tipo === "entregable" && editable && puedeEditar(evento.resource.datos)
          }
          resizable={false}
          onEventDrop={handleEventDrop}
          onSelectEvent={(evento) =>
            evento.resource.tipo === "reunion"
              ? onReunionClick?.(evento.resource.datos)
              : onEntregableClick?.(evento.resource.datos)
          }
        />
      </div>
    </div>
  );
}

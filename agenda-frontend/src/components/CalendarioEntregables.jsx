import { useEffect, useState } from "react";
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
import VistaSemana from "./VistaSemana";

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { locale: es }),
  getDay,
  locales: { es },
});

const CalendarioDnD = withDragAndDrop(Calendar);

// react-big-calendar solo se usa para "Mes" desde 2026-08-22 (Semana y
// Agenda son vistas propias, ver VistaSemana.jsx/VistaAgendaSemanal.jsx) --
// Yue pidió expresamente conservar el mes completo como tercera opción.
const MENSAJES_MES = {
  next: "Sig.",
  previous: "Ant.",
  today: "Hoy",
  month: "Mes",
  noEventsInRange: "No hay entregables en este rango.",
};

const ETIQUETA_VISTA = { semana: "Semana", month: "Mes", agenda: "Agenda" };
const VISTAS_DISPONIBLES = ["semana", "month", "agenda"];

// Toolbar compacto para react-big-calendar en modo Mes: solo Ant/Hoy/Sig +
// etiqueta -- el switcher Semana/Mes/Agenda real vive arriba (nuestro
// propio .agenda-semanal__header), así que no hace falta que
// react-big-calendar dibuje sus propios botones de vista (que además ya
// no aplican, solo tiene una vista montada).
function ToolbarSoloNav({ label, onNavigate }) {
  return (
    <div className="rbc-toolbar">
      <span className="rbc-btn-group">
        <button type="button" onClick={() => onNavigate("PREV")}>
          Ant.
        </button>
        <button type="button" onClick={() => onNavigate("TODAY")}>
          Hoy
        </button>
        <button type="button" onClick={() => onNavigate("NEXT")}>
          Sig.
        </button>
      </span>
      <span className="rbc-toolbar-label">{label}</span>
    </div>
  );
}

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
  onSeleccionarFranja,
  alto = 600,
}) {
  const [error, setError] = useState("");
  const [vista, setVista] = useState("semana");
  const [esPantallaAngosta, setEsPantallaAngosta] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 768px)");
    const onChange = () => setEsPantallaAngosta(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

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

  // Clic en un día vacío de la vista Mes para crear una reunión ahí --
  // react-big-calendar solo renderiza Mes ahora, así que `start` nunca
  // trae una hora útil (medianoche); se prellena solo la fecha, la hora
  // default (09:00) la pone ModalReunion.
  const handleSelectSlot = ({ start }) => {
    if (!onSeleccionarFranja) return;
    onSeleccionarFranja({ fecha: isoDesdeFechaLocal(start), hora: null, duracionMinutos: 30 });
  };

  return (
    <div className="stack">
      {error && <p className="error-text">{error}</p>}
      <div
        className={`calendar-responsive${vista !== "month" ? " calendar-responsive--agenda" : ""}`}
        style={{ height: alto, overflowY: vista === "semana" ? "hidden" : "auto" }}
      >
        <div className="agenda-semanal__header">
          {VISTAS_DISPONIBLES.map((v) => (
            <button
              key={v}
              type="button"
              className={`btn ${vista === v ? "btn--primary" : "btn--ghost"}`}
              onClick={() => setVista(v)}
            >
              {ETIQUETA_VISTA[v]}
            </button>
          ))}
        </div>
        {vista === "agenda" ? (
          <VistaAgendaSemanal
            eventos={eventos}
            onEntregableClick={onEntregableClick}
            onReunionClick={onReunionClick}
            onEventoEmpresaClick={onEventoEmpresaClick}
            onDiaClick={
              onSeleccionarFranja
                ? (fecha) => onSeleccionarFranja({ fecha: isoDesdeFechaLocal(fecha), hora: null, duracionMinutos: 30 })
                : undefined
            }
          />
        ) : vista === "semana" ? (
          <VistaSemana
            eventos={eventos}
            onEntregableClick={onEntregableClick}
            onReunionClick={onReunionClick}
            onEventoEmpresaClick={onEventoEmpresaClick}
            onSeleccionarFranja={onSeleccionarFranja}
            columnasFijas={!esPantallaAngosta}
          />
        ) : (
          <CalendarioDnD
            localizer={localizer}
            events={eventos}
            culture="es"
            messages={MENSAJES_MES}
            view="month"
            views={["month"]}
            startAccessor="start"
            endAccessor="end"
            eventPropGetter={eventPropGetter}
            draggableAccessor={(evento) =>
              evento.resource.tipo === "entregable" && editable && puedeEditar(evento.resource.datos)
            }
            resizable={false}
            onEventDrop={handleEventDrop}
            selectable={Boolean(onSeleccionarFranja)}
            onSelectSlot={handleSelectSlot}
            onSelectEvent={(evento) => {
              if (evento.resource.tipo === "reunion") onReunionClick?.(evento.resource.datos);
              else if (evento.resource.tipo === "entregable") onEntregableClick?.(evento.resource.datos);
              else if (evento.resource.tipo === "evento_empresa") onEventoEmpresaClick?.(evento.resource.datos);
            }}
            components={{ toolbar: ToolbarSoloNav }}
          />
        )}
      </div>
    </div>
  );
}

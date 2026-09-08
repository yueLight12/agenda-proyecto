import { useState } from "react";
import BadgeUrgente from "./BadgeUrgente";

/**
 * Vista Kanban de entregables, agrupados por columnas (por defecto, su
 * `estatus` real: pendiente / en_progreso / cumplido). Arrastrar una
 * tarjeta a otra columna reporta el % de avance objetivo de esa columna vía
 * `onMoverEstatus` — no llama a la API directamente, igual que
 * CalendarioEntregables con `onReprogramar`.
 *
 * `columnas` (2026-08-17, Vista Estatus de /equipo) es opcional -- por
 * defecto son las 3 columnas de siempre, sin cambio para TableroProyecto.jsx.
 * Una columna puede traer `filtro(entregable)` en vez de basarse solo en
 * `estatus` (así "Vencidas" puede agrupar por fecha sin ser un estatus real
 * guardado en la BD) y `soloLectura: true` para no aceptar drops -- no hay
 * un estatus real "vencida" que setear al soltar ahí.
 */
const COLUMNAS_DEFAULT = [
  { estatus: "pendiente", titulo: "Pendiente", porcentajeObjetivo: 0 },
  { estatus: "en_progreso", titulo: "En progreso", porcentajeObjetivo: 50 },
  // "Visto bueno" (2026-09-03) -- estatus intermedio al llegar a 100% (ver
  // app/models/entregable.py::EstatusEntregable), no llega por drag & drop
  // (soloLectura: true) porque no hay un % que lo dispare directamente,
  // solo pasa por ahí Aprobar/Rechazar desde el detalle de la tarea.
  { estatus: "pendiente_aprobacion", titulo: "Visto bueno", soloLectura: true },
  { estatus: "cumplido", titulo: "Cumplido", porcentajeObjetivo: 100 },
];

export function TarjetaEntregable({ entregable, equipo, onDragStart, onClick }) {
  const responsable =
    equipo.find((m) => m.usuario_id === entregable.responsable_id)?.nombre ||
    `Usuario #${entregable.responsable_id}`;

  return (
    <div
      className="kanban-card"
      draggable
      onDragStart={(ev) => onDragStart(ev, entregable)}
      onClick={() => onClick(entregable)}
    >
      <div className="kanban-card__titulo">
        {entregable.nombre}
        {entregable.sensible && (
          <span className="badge badge--sensible" style={{ marginLeft: 6 }}>
            Sensible
          </span>
        )}
        {entregable.urgente && (
          <span style={{ marginLeft: 6 }}>
            <BadgeUrgente urgente />
          </span>
        )}
      </div>
      <div className="kanban-card__meta">
        <span>{entregable.fecha_entrega}</span>
        <span>{responsable}</span>
      </div>
      <div className="progress-bar">
        <div className="progress-bar__fill" style={{ width: `${entregable.porcentaje_avance}%` }} />
      </div>
      <span className="kanban-card__porcentaje">{entregable.porcentaje_avance}%</span>
    </div>
  );
}

export default function KanbanEntregables({
  entregables,
  equipo,
  onMoverEstatus,
  onEntregableClick,
  error,
  columnas = COLUMNAS_DEFAULT,
}) {
  const [columnaActiva, setColumnaActiva] = useState(null);

  const enColumna = (columna) =>
    columna.filtro ? entregables.filter(columna.filtro) : entregables.filter((e) => e.estatus === columna.estatus);

  const manejarDragStart = (ev, entregable) => {
    ev.dataTransfer.setData("text/plain", String(entregable.id));
    ev.dataTransfer.effectAllowed = "move";
  };

  const manejarDrop = (ev, columna) => {
    ev.preventDefault();
    setColumnaActiva(null);
    const entregableId = Number(ev.dataTransfer.getData("text/plain"));
    const entregable = entregables.find((e) => e.id === entregableId);
    if (!entregable || entregable.estatus === columna.estatus) return;
    onMoverEstatus(entregable, columna.porcentajeObjetivo);
  };

  return (
    <div className="kanban-responsive">
      <div className="kanban-board">
        {columnas.map((columna) => {
          const clave = columna.estatus ?? columna.titulo;
          return (
            <div
              key={clave}
              className={`kanban-column ${columnaActiva === clave ? "kanban-column--activa" : ""}`}
              onDragOver={
                columna.soloLectura
                  ? undefined
                  : (ev) => {
                      ev.preventDefault();
                      setColumnaActiva(clave);
                    }
              }
              onDragLeave={columna.soloLectura ? undefined : () => setColumnaActiva(null)}
              onDrop={columna.soloLectura ? undefined : (ev) => manejarDrop(ev, columna)}
            >
              <div className="kanban-column__header">
                <span>{columna.titulo}</span>
                <span className="kanban-column__contador">{enColumna(columna).length}</span>
              </div>
              <div className="kanban-column__lista">
                {enColumna(columna).map((e) => (
                  <TarjetaEntregable
                    key={e.id}
                    entregable={e}
                    equipo={equipo}
                    onDragStart={manejarDragStart}
                    onClick={onEntregableClick}
                  />
                ))}
                {enColumna(columna).length === 0 && (
                  <p className="kanban-column__vacio">Sin entregables aquí.</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {error && <p className="error-text" style={{ marginTop: 8 }}>{error}</p>}
    </div>
  );
}

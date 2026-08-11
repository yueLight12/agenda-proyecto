import { useState } from "react";

/**
 * Vista Kanban de los entregables de un proyecto, agrupados por su `estatus`
 * real (pendiente / en_progreso / cumplido). Arrastrar una tarjeta a otra
 * columna reporta el % de avance objetivo de esa columna vía `onMoverEstatus`
 * — no llama a la API directamente, igual que CalendarioEntregables con
 * `onReprogramar`.
 */
const COLUMNAS = [
  { estatus: "pendiente", titulo: "Pendiente", porcentajeObjetivo: 0 },
  { estatus: "en_progreso", titulo: "En progreso", porcentajeObjetivo: 50 },
  { estatus: "cumplido", titulo: "Cumplido", porcentajeObjetivo: 100 },
];

function TarjetaEntregable({ entregable, equipo, onDragStart, onClick }) {
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

export default function KanbanEntregables({ entregables, equipo, onMoverEstatus, onEntregableClick, error }) {
  const [columnaActiva, setColumnaActiva] = useState(null);

  const porEstatus = (estatus) => entregables.filter((e) => e.estatus === estatus);

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
        {COLUMNAS.map((columna) => (
          <div
            key={columna.estatus}
            className={`kanban-column ${columnaActiva === columna.estatus ? "kanban-column--activa" : ""}`}
            onDragOver={(ev) => {
              ev.preventDefault();
              setColumnaActiva(columna.estatus);
            }}
            onDragLeave={() => setColumnaActiva(null)}
            onDrop={(ev) => manejarDrop(ev, columna)}
          >
            <div className="kanban-column__header">
              <span>{columna.titulo}</span>
              <span className="kanban-column__contador">{porEstatus(columna.estatus).length}</span>
            </div>
            <div className="kanban-column__lista">
              {porEstatus(columna.estatus).map((e) => (
                <TarjetaEntregable
                  key={e.id}
                  entregable={e}
                  equipo={equipo}
                  onDragStart={manejarDragStart}
                  onClick={onEntregableClick}
                />
              ))}
              {porEstatus(columna.estatus).length === 0 && (
                <p className="kanban-column__vacio">Sin entregables aquí.</p>
              )}
            </div>
          </div>
        ))}
      </div>
      {error && <p className="error-text" style={{ marginTop: 8 }}>{error}</p>}
    </div>
  );
}

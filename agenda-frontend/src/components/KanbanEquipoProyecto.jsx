import { useState } from "react";
import { Link } from "react-router-dom";
import { fechaLocal, textoDiasRelativos } from "../utils/fechas";
import { agruparEquipoProyectoPorSupervisor } from "../utils/equipoProyecto";
import { etiquetaRol } from "../utils/rolLabels";

// "Equipo del proyecto" en tarjetas Kanban (mismo patrón visual que
// KanbanSupervisores.jsx en "Tu equipo" del Dashboard): una columna por
// supervisor, con tarjetas expandibles que muestran los entregables/
// reuniones de esa persona EN ESTE PROYECTO (a diferencia de
// KanbanSupervisores, que cruza varios proyectos).
function DetalleMiembro({ usuarioId, entregables, reuniones }) {
  const hoyIso = new Date().toISOString().slice(0, 10);
  const susEntregables = entregables.filter((e) => e.responsable_id === usuarioId);
  const susReuniones = reuniones.filter(
    (r) => r.organizador_id === usuarioId || r.participantes?.some((p) => p.usuario_id === usuarioId)
  );

  if (susEntregables.length === 0 && susReuniones.length === 0) {
    return (
      <p style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", margin: "4px 0 0" }}>
        Sin entregables ni reuniones en este proyecto.
      </p>
    );
  }

  return (
    <div className="stack" style={{ gap: 4, padding: "4px 0 0 12px" }}>
      {susEntregables.map((e) => {
        const vencido = e.estatus !== "cumplido" && e.fecha_entrega < hoyIso;
        return (
          <div
            key={`entregable-${e.id}`}
            style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: "0.8rem" }}
          >
            <span>
              {vencido && "🔴 "}
              {e.nombre}
            </span>
            <span style={{ color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
              {fechaLocal(e.fecha_entrega).toLocaleDateString("es-MX", { dateStyle: "short" })} ·{" "}
              {textoDiasRelativos(e.fecha_entrega)}
            </span>
          </div>
        );
      })}
      {susReuniones.map((r) => (
        <div
          key={`reunion-${r.id}`}
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 8,
            fontSize: "0.8rem",
            color: "var(--color-text-muted)",
          }}
        >
          <span>🗓️ {r.titulo}</span>
          <span style={{ whiteSpace: "nowrap" }}>
            {new Date(r.fecha_inicio).toLocaleDateString("es-MX", { dateStyle: "short" })}
          </span>
        </div>
      ))}
    </div>
  );
}

function TarjetaMiembro({ miembro, entregables, reuniones, onQuitar }) {
  const [abierta, setAbierta] = useState(false);

  return (
    <div className="kanban-card" style={{ cursor: "default" }}>
      <div className="list-inline" style={{ padding: 0, borderBottom: "none" }}>
        <Link to={`/perfil/${miembro.usuario_id}`} className="kanban-card__titulo">
          {miembro.nombre}
        </Link>
        <button
          type="button"
          className="btn btn--ghost"
          style={{ fontSize: "0.8rem", padding: "2px 6px" }}
          onClick={() => setAbierta((actual) => !actual)}
          aria-expanded={abierta}
        >
          {etiquetaRol(miembro.rol)} {abierta ? "▲" : "▼"}
        </button>
      </div>
      {miembro.puesto && (
        <div style={{ fontSize: "0.78rem", color: "var(--color-text-muted)" }}>{miembro.puesto}</div>
      )}
      {abierta && (
        <DetalleMiembro usuarioId={miembro.usuario_id} entregables={entregables} reuniones={reuniones} />
      )}
      <button
        type="button"
        className="btn btn--ghost"
        style={{ marginTop: 6, fontSize: "0.78rem", padding: "2px 8px" }}
        onClick={() => onQuitar(miembro.usuario_id)}
      >
        Quitar
      </button>
    </div>
  );
}

export default function KanbanEquipoProyecto({ miembros, entregables = [], reuniones = [], onQuitar }) {
  const { columnas, sinSupervisor } = agruparEquipoProyectoPorSupervisor(miembros);

  if (miembros.length === 0) {
    return (
      <p style={{ color: "var(--color-text-muted)" }}>
        Aún no hay miembros visibles para ti en este proyecto.
      </p>
    );
  }

  return (
    <div className="kanban-responsive">
      <div className="kanban-board">
        {columnas.map((columna) => (
          <div key={`sup-${columna.usuario_id}`} className="kanban-column">
            <div className="kanban-column__header">
              <span>{columna.nombre}</span>
              <span className="kanban-column__contador">{columna.miembros.length}</span>
            </div>
            <div className="kanban-column__lista">
              {columna.miembros.map((m) => (
                <TarjetaMiembro
                  key={m.usuario_id}
                  miembro={m}
                  entregables={entregables}
                  reuniones={reuniones}
                  onQuitar={onQuitar}
                />
              ))}
            </div>
          </div>
        ))}
        {sinSupervisor.length > 0 && (
          <div className="kanban-column">
            <div className="kanban-column__header">
              <span>Sin supervisor asignado</span>
              <span className="kanban-column__contador">{sinSupervisor.length}</span>
            </div>
            <div className="kanban-column__lista">
              {sinSupervisor.map((m) => (
                <TarjetaMiembro
                  key={m.usuario_id}
                  miembro={m}
                  entregables={entregables}
                  reuniones={reuniones}
                  onQuitar={onQuitar}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import { useState } from "react";
import { Link } from "react-router-dom";
import { agruparPorSupervisor } from "../utils/equipoSupervisores";
import { fechaLocal, textoDiasRelativos } from "../utils/fechas";

// "Tu equipo" en tarjetas Kanban (mismo patrón visual que
// KanbanAtencion.jsx): una columna por SUPERVISOR (cruzando proyectos, ver
// agruparPorSupervisor en utils/equipoSupervisores.js), y dentro de cada tarjeta
// una lista colapsable de sus subordinados — al expandir a una persona se
// ven sus proyectos con entregables y reuniones bajo ese supervisor.
function EntregablesYReuniones({ proyectos }) {
  const hoyIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="stack" style={{ gap: 8, padding: "4px 0 4px 12px" }}>
      {proyectos.map((p) => (
        <div key={p.proyecto_id}>
          <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--color-text-muted)" }}>
            {p.proyecto_nombre}
          </div>
          {p.entregables.length === 0 && p.reuniones.length === 0 && (
            <p style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", margin: "2px 0" }}>
              Sin entregables ni reuniones aquí.
            </p>
          )}
          {p.entregables.map((e) => {
            const vencido = e.estatus !== "cumplido" && e.fecha_entrega < hoyIso;
            return (
              <Link
                key={`entregable-${e.id}`}
                to={`/proyectos/${p.proyecto_id}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                  fontSize: "0.8rem",
                  padding: "2px 0",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <span>
                  {vencido && "🔴 "}
                  {e.nombre}
                </span>
                <span style={{ color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
                  {fechaLocal(e.fecha_entrega).toLocaleDateString("es-MX", { dateStyle: "short" })} ·{" "}
                  {textoDiasRelativos(e.fecha_entrega)}
                </span>
              </Link>
            );
          })}
          {p.reuniones.map((r) => (
            <div
              key={`reunion-${r.id}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
                fontSize: "0.8rem",
                padding: "2px 0",
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
      ))}
    </div>
  );
}

function TarjetaSupervisor({ supervisor }) {
  const [personaAbiertaId, setPersonaAbiertaId] = useState(null);

  const totalVencidos = supervisor.reportes.reduce(
    (acc, r) =>
      acc +
      r.proyectos.reduce((a, p) => {
        const hoyIso = new Date().toISOString().slice(0, 10);
        return a + p.entregables.filter((e) => e.estatus !== "cumplido" && e.fecha_entrega < hoyIso).length;
      }, 0),
    0
  );

  return (
    <div className="kanban-column">
      <div className="kanban-column__header">
        <span>{supervisor.nombre}</span>
        <span className="kanban-column__contador">{supervisor.reportes.length}</span>
      </div>
      {totalVencidos > 0 && (
        <p style={{ fontSize: "0.78rem", color: "var(--color-danger)", margin: "2px 0 6px" }}>
          🔴 {totalVencidos} entregable{totalVencidos === 1 ? "" : "s"} vencido{totalVencidos === 1 ? "" : "s"} en
          su equipo
        </p>
      )}
      <div className="kanban-column__lista">
        {supervisor.reportes.map((r) => {
          const abierta = personaAbiertaId === r.usuario_id;
          return (
            <div key={r.usuario_id} className="kanban-card" style={{ cursor: "default" }}>
              <button
                type="button"
                className="list-inline list-inline--boton"
                style={{ padding: 0 }}
                onClick={() => setPersonaAbiertaId(abierta ? null : r.usuario_id)}
                aria-expanded={abierta}
              >
                <div className="kanban-card__titulo">{r.nombre}</div>
                <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                  {r.proyectos.length} proyecto{r.proyectos.length === 1 ? "" : "s"} {abierta ? "▲" : "▼"}
                </span>
              </button>
              {abierta && <EntregablesYReuniones proyectos={r.proyectos} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function KanbanSupervisores({ miembros }) {
  const supervisores = agruparPorSupervisor(miembros);

  if (supervisores.length === 0) {
    return (
      <p style={{ color: "var(--color-text-muted)" }}>
        No tienes equipo visible en ningún proyecto todavía.
      </p>
    );
  }

  return (
    <div className="kanban-responsive">
      <div className="kanban-board">
        {supervisores.map((s) => (
          <TarjetaSupervisor key={s.usuario_id} supervisor={s} />
        ))}
      </div>
    </div>
  );
}

import { Link } from "react-router-dom";
import { armarColumnasEquipo } from "../utils/equipoSupervisores";
import { fechaLocal, textoDiasRelativos } from "../utils/fechas";
import { etiquetaRol } from "../utils/rolLabels";
import EstatusBadge from "./EstatusBadge";

// "Tu equipo" en tarjetas Kanban: una columna por cada persona directamente
// debajo de quien ve la pantalla (ver armarColumnasEquipo en
// utils/equipoSupervisores.js) — el CONTENIDO de cada columna son siempre
// PROYECTOS (con sus entregables/reuniones), nunca una lista de personas:
// si esa persona a su vez supervisa a un equipo, sus proyectos ya vienen
// agregados en una sola columna con su nombre (ej. Bernardo ve una columna
// "David" con los proyectos Cubo/Suit/Agenda Inteligente, no los nombres de
// Ana/Iván/Juan). La regla es la misma para cualquier nivel de la
// jerarquía, sin ramas especiales por rol — se ajusta sola conforme
// cambien personas o proyectos.
//
// `onAdministrar` es opcional: cuando se pasa (uso desde ResumenEquipo.jsx
// en /equipo), cada proyecto donde el viewer puede administrar (campo
// calculado en servidor `viewer_puede_administrar`, ver Fase 1 de
// jerarquía 2026-08-16 -- nunca se recalcula cruzando
// usuario.roles_por_proyecto, se rompe con herencia) muestra un botón
// "Administrar" que abre ModalEquipo — el Dashboard ("Tu equipo") no lo
// pasa y por tanto no muestra ese botón, sin cambio de comportamiento ahí.
function EntregablesYReuniones({ proyectos, onAdministrar }) {
  const hoyIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="stack" style={{ gap: 8, padding: "4px 0 4px 12px" }}>
      {proyectos.map((p) => (
        <div key={p.proyecto_id}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--color-text-muted)" }}>
              <Link to={`/proyectos/${p.proyecto_id}`} style={{ color: "inherit" }}>
                {p.proyecto_nombre}
              </Link>
              {p.rol && <span style={{ fontWeight: 400 }}> ({etiquetaRol(p.rol)})</span>}
            </span>
            {onAdministrar && p.viewer_puede_administrar && (
              <button
                className="btn btn--ghost"
                type="button"
                style={{ fontSize: "0.75rem", padding: "2px 8px" }}
                onClick={() => onAdministrar(p.proyecto_id, p.proyecto_nombre)}
              >
                Administrar
              </button>
            )}
          </div>
          {p.entregables.length === 0 && p.reuniones.length === 0 && (
            <p style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", margin: "2px 0" }}>
              Sin entregables ni reuniones aquí.
            </p>
          )}
          {p.entregables.map((e) => {
            const vencido = e.estatus !== "cumplido" && e.fecha_entrega < hoyIso;
            return (
              <div key={`entregable-${e.id}`} style={{ padding: "3px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: "0.8rem" }}>
                  <Link
                    to={`/proyectos/${p.proyecto_id}?entregable=${e.id}`}
                    style={{ color: "inherit", textDecoration: "none", flex: 1 }}
                  >
                    {vencido && "🔴 "}
                    {e.nombre}
                    {e.sensible && (
                      <span className="badge badge--sensible" style={{ marginLeft: 6, fontSize: "0.65rem" }}>
                        Sensible
                      </span>
                    )}
                  </Link>
                  <EstatusBadge estatus={e.estatus} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div className="progress-bar" style={{ flex: 1 }}>
                    <div className="progress-bar__fill" style={{ width: `${e.porcentaje_avance}%` }} />
                  </div>
                  <span style={{ fontSize: "0.7rem", color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
                    {fechaLocal(e.fecha_entrega).toLocaleDateString("es-MX", { dateStyle: "short" })} ·{" "}
                    {textoDiasRelativos(e.fecha_entrega)}
                  </span>
                </div>
              </div>
            );
          })}
          {p.reuniones.map((r) => (
            <Link
              key={`reunion-${r.id}`}
              to={`/proyectos/${p.proyecto_id}?reunion=${r.id}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
                fontSize: "0.8rem",
                padding: "2px 0",
                color: "var(--color-text-muted)",
                textDecoration: "none",
              }}
            >
              <span>🗓️ {r.titulo}</span>
              <span style={{ whiteSpace: "nowrap" }}>
                {new Date(r.fecha_inicio).toLocaleDateString("es-MX", { dateStyle: "short" })}
              </span>
            </Link>
          ))}
        </div>
      ))}
    </div>
  );
}

function TarjetaColumna({ columna, onAdministrar }) {
  const hoyIso = new Date().toISOString().slice(0, 10);
  const vencidos = columna.proyectos.reduce(
    (acc, p) => acc + p.entregables.filter((e) => e.estatus !== "cumplido" && e.fecha_entrega < hoyIso).length,
    0
  );

  return (
    <div className="kanban-column">
      <div className="kanban-column__header">
        <span>{columna.nombre}</span>
        <span className="kanban-column__contador">{columna.proyectos.length}</span>
      </div>
      {vencidos > 0 && (
        <p style={{ fontSize: "0.78rem", color: "var(--color-danger)", margin: "2px 0 6px" }}>
          🔴 {vencidos} entregable{vencidos === 1 ? "" : "s"} vencido{vencidos === 1 ? "" : "s"}
        </p>
      )}
      <div className="kanban-column__lista">
        {columna.proyectos.length === 0 ? (
          <p style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", margin: "4px 0" }}>
            Sin temas asignados todavía.
          </p>
        ) : (
          <EntregablesYReuniones proyectos={columna.proyectos} onAdministrar={onAdministrar} />
        )}
      </div>
    </div>
  );
}

export default function KanbanSupervisores({ miembros, onAdministrar, usuarioActualId }) {
  const columnas = armarColumnasEquipo(miembros, usuarioActualId);

  if (columnas.length === 0) {
    return (
      <p style={{ color: "var(--color-text-muted)" }}>
        No tienes equipo visible en ningún tema todavía.
      </p>
    );
  }

  return (
    <div className="kanban-responsive">
      <div className="kanban-board">
        {columnas.map((c) => (
          <TarjetaColumna key={c.usuario_id} columna={c} onAdministrar={onAdministrar} />
        ))}
      </div>
    </div>
  );
}

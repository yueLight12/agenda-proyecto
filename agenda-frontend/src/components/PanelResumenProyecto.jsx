import { useEffect, useState } from "react";
import { entregablesApi, proyectosApi, reunionesApi } from "../api/endpoints";
import { etiquetaRol } from "../utils/rolLabels";
import EstatusBadge from "./EstatusBadge";

/**
 * Vista compacta de "todo lo del proyecto" (equipo, entregables, reuniones)
 * pensada para expandirse inline en Dashboard sin navegar a otra pantalla.
 */
export default function PanelResumenProyecto({ proyectoId }) {
  const [equipo, setEquipo] = useState([]);
  const [entregables, setEntregables] = useState([]);
  const [reuniones, setReuniones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let activo = true;
    setCargando(true);
    setError("");
    Promise.all([
      proyectosApi.equipo(proyectoId),
      entregablesApi.listarPorProyecto(proyectoId),
      reunionesApi.listarPorProyecto(proyectoId),
    ])
      .then(([eq, ent, reu]) => {
        if (!activo) return;
        setEquipo(eq);
        setEntregables(ent);
        setReuniones(reu);
      })
      .catch(() => activo && setError("No se pudo cargar el detalle de este tema."))
      .finally(() => activo && setCargando(false));
    return () => {
      activo = false;
    };
  }, [proyectoId]);

  if (cargando) return <p style={{ fontSize: "0.85rem" }}>Cargando detalle...</p>;
  if (error) return <p className="error-text">{error}</p>;

  return (
    <div className="stack" style={{ gap: 16, paddingTop: 8 }}>
      <div>
        <h4 style={{ fontSize: "0.85rem", margin: "0 0 6px" }}>Equipo y entregables por persona</h4>
        {equipo.length === 0 && (
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.8rem" }}>
            No hay miembros visibles para ti en este tema.
          </p>
        )}
        {equipo.map((m) => {
          const entregablesDe = entregables.filter((e) => e.responsable_id === m.usuario_id);
          return (
            <div key={m.usuario_id} style={{ padding: "6px 0" }}>
              <div className="list-inline" style={{ padding: 0 }}>
                <span>
                  <strong>{m.nombre}</strong>{" "}
                  <span style={{ color: "var(--color-text-muted)" }}>({etiquetaRol(m.rol)})</span>
                </span>
                <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                  {entregablesDe.length} entregable{entregablesDe.length === 1 ? "" : "s"}
                </span>
              </div>
              {entregablesDe.length === 0 ? (
                <p style={{ color: "var(--color-text-muted)", fontSize: "0.8rem", margin: "2px 0 0 12px" }}>
                  Sin entregables asignados.
                </p>
              ) : (
                entregablesDe.map((e) => (
                  <div key={e.id} className="list-inline" style={{ padding: "4px 0 4px 12px" }}>
                    <div style={{ flex: 1, marginRight: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>
                          {e.nombre}
                          {e.sensible && (
                            <span className="badge badge--sensible" style={{ marginLeft: 8 }}>
                              Sensible
                            </span>
                          )}
                        </span>
                        <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                          {e.porcentaje_avance}%
                        </span>
                      </div>
                      <div className="progress-bar">
                        <div className="progress-bar__fill" style={{ width: `${e.porcentaje_avance}%` }} />
                      </div>
                    </div>
                    <EstatusBadge estatus={e.estatus} />
                  </div>
                ))
              )}
            </div>
          );
        })}
        {entregables.filter((e) => !equipo.some((m) => m.usuario_id === e.responsable_id)).length > 0 && (
          <div style={{ padding: "6px 0" }}>
            <div className="list-inline" style={{ padding: 0 }}>
              <strong>Otros</strong>
              <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                Responsable fuera del equipo visible
              </span>
            </div>
            {entregables
              .filter((e) => !equipo.some((m) => m.usuario_id === e.responsable_id))
              .map((e) => (
                <div key={e.id} className="list-inline" style={{ padding: "4px 0 4px 12px" }}>
                  <div style={{ flex: 1, marginRight: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>
                        {e.nombre}
                        {e.sensible && (
                          <span className="badge badge--sensible" style={{ marginLeft: 8 }}>
                            Sensible
                          </span>
                        )}
                      </span>
                      <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                        {e.porcentaje_avance}%
                      </span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-bar__fill" style={{ width: `${e.porcentaje_avance}%` }} />
                    </div>
                  </div>
                  <EstatusBadge estatus={e.estatus} />
                </div>
              ))}
          </div>
        )}
      </div>

      <div>
        <h4 style={{ fontSize: "0.85rem", margin: "0 0 6px" }}>Reuniones</h4>
        {reuniones.length === 0 && (
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.8rem" }}>
            No hay reuniones visibles para ti en este tema.
          </p>
        )}
        {[...reuniones]
          .sort((a, b) => new Date(a.fecha_inicio) - new Date(b.fecha_inicio))
          .map((r) => (
            <div key={r.id} className="list-inline" style={{ padding: "4px 0" }}>
              <strong>{r.titulo}</strong>
              <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                {new Date(r.fecha_inicio).toLocaleString("es-MX", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}{" "}
                — organiza {r.organizador_nombre}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}

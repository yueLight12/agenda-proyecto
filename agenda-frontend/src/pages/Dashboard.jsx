import { useEffect, useState } from "react";
import { dashboardApi, reunionesApi } from "../api/endpoints";
import PanelResumenProyecto from "../components/PanelResumenProyecto";

export default function Dashboard() {
  const [resumen, setResumen] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const [proyectoExpandidoId, setProyectoExpandidoId] = useState(null);
  const [reunionExpandidaId, setReunionExpandidaId] = useState(null);
  const [detalleReunion, setDetalleReunion] = useState(null);
  const [errorReunion, setErrorReunion] = useState("");

  useEffect(() => {
    dashboardApi
      .resumen()
      .then(setResumen)
      .catch(() => setError("No se pudo cargar el resumen. Intenta de nuevo más tarde."))
      .finally(() => setCargando(false));
  }, []);

  const toggleProyecto = (proyectoId) => {
    setProyectoExpandidoId((actual) => (actual === proyectoId ? null : proyectoId));
  };

  const toggleReunion = async (reunion) => {
    if (reunionExpandidaId === reunion.id) {
      setReunionExpandidaId(null);
      return;
    }
    setReunionExpandidaId(reunion.id);
    setErrorReunion("");
    setDetalleReunion(null);
    try {
      const detalle = await reunionesApi.obtener(reunion.id);
      setDetalleReunion(detalle);
    } catch {
      setErrorReunion("No se pudo cargar el detalle de esta reunión.");
    }
  };

  if (cargando) return <p>Cargando resumen...</p>;
  if (error) return <p className="error-text">{error}</p>;

  return (
    <div className="stack">
      <h1>Resumen general</h1>

      <div className="grid-summary">
        <div className="stat">
          <div className="stat__value">{resumen.porcentaje_avance_global}%</div>
          <div className="stat__label">Avance global (todos tus proyectos)</div>
        </div>
        <div className="stat">
          <div className="stat__value">{resumen.total_proyectos}</div>
          <div className="stat__label">Proyectos</div>
        </div>
        <div className="stat">
          <div className="stat__value">{resumen.entregables_vencidos}</div>
          <div className="stat__label">Entregables vencidos</div>
        </div>
        <div className="stat">
          <div className="stat__value">{resumen.entregables_proximos_a_vencer}</div>
          <div className="stat__label">Próximos a vencer</div>
        </div>
        <div className="stat">
          <div className="stat__value">{resumen.entregables_cumplidos}</div>
          <div className="stat__label">Cumplidos</div>
        </div>
        <div className="stat">
          <div className="stat__value">{resumen.notificaciones_no_leidas}</div>
          <div className="stat__label">Notificaciones sin leer</div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ fontSize: "0.95rem", marginTop: 0 }}>Avance por proyecto</h3>
        {resumen.proyectos.length === 0 && (
          <p style={{ color: "var(--color-text-muted)" }}>
            No tienes proyectos asignados todavía.
          </p>
        )}
        {resumen.proyectos.map((p) => (
          <div key={p.proyecto_id}>
            <div
              className="list-inline"
              style={{ cursor: "pointer" }}
              onClick={() => toggleProyecto(p.proyecto_id)}
            >
              <div style={{ flex: 1, marginRight: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <strong>{p.proyecto_nombre}</strong>
                  <span style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
                    {p.porcentaje_avance}%
                  </span>
                </div>
                <div className="progress-bar">
                  <div className="progress-bar__fill" style={{ width: `${p.porcentaje_avance}%` }} />
                </div>
              </div>
              <span style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
                {p.entregables_vencidos} vencidos · {p.entregables_proximos_a_vencer} próximos
                {" "}{proyectoExpandidoId === p.proyecto_id ? "▲" : "▼"}
              </span>
            </div>
            {proyectoExpandidoId === p.proyecto_id && (
              <PanelResumenProyecto proyectoId={p.proyecto_id} />
            )}
          </div>
        ))}
      </div>

      <div className="card">
        <h3 style={{ fontSize: "0.95rem", marginTop: 0 }}>Reuniones de hoy / esta semana</h3>
        {resumen.reuniones_proximas.length === 0 && (
          <p style={{ color: "var(--color-text-muted)" }}>
            No tienes reuniones agendadas en los próximos 7 días.
          </p>
        )}
        {resumen.reuniones_proximas.map((r) => (
          <div key={r.id}>
            <div
              className="list-inline"
              style={{ cursor: "pointer" }}
              onClick={() => toggleReunion(r)}
            >
              <div>
                <strong>{r.titulo}</strong>{" "}
                <span style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
                  {r.proyecto_nombre} — organiza {r.organizador_nombre}
                </span>
              </div>
              <span style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
                {new Date(r.fecha_inicio).toLocaleString("es-MX", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}{" "}
                {reunionExpandidaId === r.id ? "▲" : "▼"}
              </span>
            </div>
            {reunionExpandidaId === r.id && (
              <div style={{ padding: "4px 0 12px 4px" }}>
                {errorReunion && <p className="error-text">{errorReunion}</p>}
                {!errorReunion && !detalleReunion && <p style={{ fontSize: "0.85rem" }}>Cargando...</p>}
                {detalleReunion && (
                  <div className="stack" style={{ gap: 4 }}>
                    {detalleReunion.notas && (
                      <p style={{ fontSize: "0.85rem" }}>{detalleReunion.notas}</p>
                    )}
                    <p style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                      Participantes:{" "}
                      {detalleReunion.participantes.map((p) => p.nombre).join(", ") || "ninguno"}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

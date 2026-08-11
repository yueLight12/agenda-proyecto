import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { equipoResumenApi } from "../api/endpoints";
import DashboardCompleto from "./DashboardCompleto";

// Vista simplificada del dashboard para usuarios que son N1 (dirección) en
// TODOS sus proyectos ("Cards de atención", ver CLAUDE.md). No oculta
// información: el detalle completo sigue disponible en el expansor "Ver
// todos los proyectos", que reutiliza DashboardCompleto tal cual.
export default function DashboardSimplificado({ resumen }) {
  const [verTodo, setVerTodo] = useState(false);
  const [atencionAbierta, setAtencionAbierta] = useState(true);
  const [equipoAbierto, setEquipoAbierto] = useState(true);

  // "Tu equipo": reutiliza tal cual GET /equipo/resumen (mismo endpoint que
  // usa ResumenEquipo.jsx en /equipo) — se pide aparte, no viene en
  // DashboardOut, para no cargarlo también para usuarios que ven
  // DashboardCompleto (N2/N3/N4).
  const [equipo, setEquipo] = useState([]);
  const [cargandoEquipo, setCargandoEquipo] = useState(true);
  useEffect(() => {
    equipoResumenApi
      .resumen()
      .then((data) => setEquipo(data.miembros))
      .catch(() => {})
      .finally(() => setCargandoEquipo(false));
  }, []);

  const hoyIso = new Date().toISOString().slice(0, 10);
  const equipoConVencidos = useMemo(
    () =>
      equipo
        .map((m) => ({
          ...m,
          totalVencidos: m.proyectos.reduce(
            (acc, p) =>
              acc + p.entregables.filter((e) => e.estatus !== "cumplido" && e.fecha_entrega < hoyIso).length,
            0
          ),
        }))
        .sort((a, b) => b.totalVencidos - a.totalVencidos),
    [equipo, hoyIso]
  );

  const reunionesHoy = useMemo(() => {
    const hoy = new Date();
    return resumen.reuniones_proximas.filter((r) => {
      const fecha = new Date(r.fecha_inicio);
      return (
        fecha.getFullYear() === hoy.getFullYear() &&
        fecha.getMonth() === hoy.getMonth() &&
        fecha.getDate() === hoy.getDate()
      );
    });
  }, [resumen.reuniones_proximas]);

  const vencidos = resumen.entregables_atencion.filter((e) => e.urgencia === "vencido");
  const proximos = resumen.entregables_atencion.filter((e) => e.urgencia === "proximo");

  return (
    <div className="stack">
      <div className="grid-summary">
        <div className="stat">
          <div className="stat__value">{resumen.porcentaje_avance_global}%</div>
          <div className="stat__label">Avance global</div>
        </div>
        <div className="stat">
          <div className="stat__value">{resumen.entregables_vencidos}</div>
          <div className="stat__label">Vencidos</div>
        </div>
        <div className="stat">
          <div className="stat__value">{resumen.entregables_proximos_a_vencer}</div>
          <div className="stat__label">Por vencer</div>
        </div>
        <div className="stat">
          <div className="stat__value">{reunionesHoy.length}</div>
          <div className="stat__label">Reuniones hoy</div>
        </div>
      </div>

      <div className="card">
        <button
          type="button"
          className="list-inline list-inline--boton"
          onClick={() => setAtencionAbierta((v) => !v)}
          aria-expanded={atencionAbierta}
        >
          <h3 style={{ fontSize: "0.95rem", margin: 0 }}>Requiere tu atención</h3>
          <span style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
            {vencidos.length + reunionesHoy.length + proximos.length} {" "}
            {atencionAbierta ? "▲" : "▼"}
          </span>
        </button>

        {atencionAbierta && (
        <>
        {vencidos.length === 0 && proximos.length === 0 && reunionesHoy.length === 0 && (
          <p style={{ color: "var(--color-text-muted)" }}>
            Nada urgente por ahora — todo al día.
          </p>
        )}

        {vencidos.map((e) => (
          <Link
            key={`entregable-${e.id}`}
            to={`/proyectos/${e.proyecto_id}`}
            className="list-inline"
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <div>
              🔴 <strong>{e.nombre}</strong>{" "}
              <span style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
                {e.proyecto_nombre} — {e.responsable_nombre}
              </span>
            </div>
            <span style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
              vencido el {new Date(e.fecha_entrega).toLocaleDateString("es-MX", { dateStyle: "medium" })}
            </span>
          </Link>
        ))}

        {reunionesHoy.map((r) => (
          <div key={`reunion-${r.id}`} className="list-inline">
            <div>
              🟡 <strong>{r.titulo}</strong>{" "}
              <span style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
                {r.proyecto_nombre} — organiza {r.organizador_nombre}
              </span>
            </div>
            <span style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
              {new Date(r.fecha_inicio).toLocaleTimeString("es-MX", { timeStyle: "short" })}
            </span>
          </div>
        ))}

        {proximos.map((e) => (
          <Link
            key={`entregable-${e.id}`}
            to={`/proyectos/${e.proyecto_id}`}
            className="list-inline"
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <div>
              🟡 <strong>{e.nombre}</strong>{" "}
              <span style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
                {e.proyecto_nombre} — {e.responsable_nombre}
              </span>
            </div>
            <span style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
              vence el {new Date(e.fecha_entrega).toLocaleDateString("es-MX", { dateStyle: "medium" })}
            </span>
          </Link>
        ))}
        </>
        )}
      </div>

      <div className="card">
        <button
          type="button"
          className="list-inline list-inline--boton"
          onClick={() => setEquipoAbierto((v) => !v)}
          aria-expanded={equipoAbierto}
        >
          <h3 style={{ fontSize: "0.95rem", margin: 0 }}>Tu equipo</h3>
          <span style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
            {equipo.length} {equipoAbierto ? "▲" : "▼"}
          </span>
        </button>

        {equipoAbierto && (
        <>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Link to="/equipo" style={{ fontSize: "0.85rem" }}>
            Ver equipo completo →
          </Link>
        </div>

        {!cargandoEquipo && equipo.length === 0 && (
          <p style={{ color: "var(--color-text-muted)" }}>
            No tienes equipo visible en ningún proyecto todavía.
          </p>
        )}

        {equipoConVencidos.map((m) => (
          <Link
            key={m.usuario_id}
            to="/equipo"
            className="list-inline"
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <div>
              <strong>{m.nombre}</strong>{" "}
              <span style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
                {m.puesto || m.email}
              </span>
            </div>
            <span style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
              {m.proyectos.length} proyecto{m.proyectos.length === 1 ? "" : "s"}
              {m.totalVencidos > 0 && ` · 🔴 ${m.totalVencidos} vencido${m.totalVencidos === 1 ? "" : "s"}`}
            </span>
          </Link>
        ))}
        </>
        )}
      </div>

      <button className="btn btn--ghost" onClick={() => setVerTodo((v) => !v)}>
        {verTodo ? "Ocultar todos los proyectos ▲" : "Ver todos los proyectos ▼"}
      </button>

      {verTodo && <DashboardCompleto resumen={resumen} />}
    </div>
  );
}

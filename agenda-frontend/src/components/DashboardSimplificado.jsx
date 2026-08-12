import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { equipoResumenApi } from "../api/endpoints";
import DashboardCompleto from "./DashboardCompleto";
import KanbanSupervisores from "./KanbanSupervisores";

// Vista del Resumen general para TODOS los roles ("Cards de atención", ver
// CLAUDE.md) — antes era exclusiva de usuarios N1 puros, unificada para
// todos el 2026-08-12. No oculta información: el detalle completo sigue
// disponible en el expansor "Ver todos los proyectos", que reutiliza
// DashboardCompleto tal cual.
//
// "Requiere tu atención" vivió aquí como tarjeta/Kanban (KanbanAtencion.jsx)
// hasta el 2026-08-12, cuando se movió al panel de Notificaciones (ver
// useRequiereAtencion.js + ModalNotificaciones.jsx en AppLayout.jsx) para
// que fuera visible desde cualquier pantalla, no solo el Dashboard.
export default function DashboardSimplificado({ resumen }) {
  const [verTodo, setVerTodo] = useState(false);
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

        {!cargandoEquipo && <KanbanSupervisores miembros={equipo} />}
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

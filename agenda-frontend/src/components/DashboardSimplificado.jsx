import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { equipoResumenApi } from "../api/endpoints";
import { useAuth } from "../context/AuthContext";
import KanbanSupervisores from "./KanbanSupervisores";

// Vista del Resumen general para TODOS los roles ("Cards de atención", ver
// CLAUDE.md) — antes era exclusiva de usuarios N1 puros, unificada para
// todos el 2026-08-12.
//
// El expansor "Ver todos los proyectos" (que mostraba DashboardCompleto
// aquí mismo) se ocultó a pedido de Yue el 2026-08-14 — DashboardCompleto.jsx
// sigue existiendo intacto, solo dejó de estar enlazado desde esta vista.
//
// "Requiere tu atención" vivió aquí como tarjeta/Kanban (KanbanAtencion.jsx)
// hasta el 2026-08-12, cuando se movió al panel de Notificaciones para que
// fuera visible desde cualquier pantalla, no solo el Dashboard; y el
// 2026-08-14 ese contenido pasó de calcularse en vivo a ser notificaciones
// reales generadas por el backend (ver ModalNotificaciones.jsx).
export default function DashboardSimplificado({ resumen }) {
  const { usuario } = useAuth();
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
          <Link to="/app/equipo" style={{ fontSize: "0.85rem" }}>
            Ver equipo completo →
          </Link>
        </div>

        {!cargandoEquipo && <KanbanSupervisores miembros={equipo} usuarioActualId={usuario?.id} />}
        </>
        )}
      </div>
    </div>
  );
}

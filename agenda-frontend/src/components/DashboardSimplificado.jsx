import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { equipoResumenApi, eventosEmpresaApi } from "../api/endpoints";
import DashboardCompleto from "./DashboardCompleto";
import KanbanAtencion from "./KanbanAtencion";

// Vista del Resumen general para TODOS los roles ("Cards de atención", ver
// CLAUDE.md) — antes era exclusiva de usuarios N1 puros, unificada para
// todos el 2026-08-12 para que "Requiere tu atención" también la vean
// N2/N3/N4. No oculta información: el detalle completo sigue disponible en
// el expansor "Ver todos los proyectos", que reutiliza DashboardCompleto
// tal cual.
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

  // Cumpleaños que caen hoy, mañana o en 2 días — mismo horizonte que las
  // notificaciones automáticas (ver generar_recordatorios_cumpleanos).
  const [cumpleanosProximos, setCumpleanosProximos] = useState([]);
  useEffect(() => {
    eventosEmpresaApi
      .listar()
      .then((eventos) => {
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        const limite = new Date(hoy);
        limite.setDate(limite.getDate() + 2);
        setCumpleanosProximos(
          eventos.filter((e) => {
            if (e.tipo !== "cumpleanos") return false;
            const [anio, mes, dia] = e.fecha.split("-").map(Number);
            const fecha = new Date(anio, mes - 1, dia);
            return fecha >= hoy && fecha <= limite;
          })
        );
      })
      .catch(() => {});
  }, []);

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
            {vencidos.length + reunionesHoy.length + proximos.length + cumpleanosProximos.length} {" "}
            {atencionAbierta ? "▲" : "▼"}
          </span>
        </button>

        {atencionAbierta && (
          <KanbanAtencion
            vencidos={vencidos}
            proximos={proximos}
            reunionesHoy={reunionesHoy}
            cumpleanosProximos={cumpleanosProximos}
          />
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

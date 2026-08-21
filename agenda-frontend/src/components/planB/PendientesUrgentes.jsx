import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { dashboardApi, entregablesApi, notificacionesApi } from "../../api/endpoints";
import BadgeUrgente from "../BadgeUrgente";

// "Pendientes / Por hacer" de Agenda Plan B (2026-08-20) -- no hay endpoint
// nuevo: se componen las frases en el frontend a partir de datos que YA
// existen (notificaciones no leídas + entregables_atencion/reuniones_
// proximas de GET /dashboard/resumen), para no duplicar lógica de negocio
// que el backend ya calcula (es_urgente, urgencia vencido/próximo). Se
// recarga cuando `recargarSenal` cambia (AgendaPlanB.jsx lo incrementa
// después de crear una tarea/proyecto).
export default function PendientesUrgentes({ recargarSenal }) {
  const [notificaciones, setNotificaciones] = useState([]);
  const [entregablesAtencion, setEntregablesAtencion] = useState([]);
  const [reunionesHoy, setReunionesHoy] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  // Marcar concluido es por-fila (2026-08-20, a petición de Yue: "un clic
  // directo, sin confirmar") -- se deshabilita solo el botón de ESA fila
  // mientras corre, no toda la lista.
  const [marcandoId, setMarcandoId] = useState(null);

  const cargar = useCallback(() => {
    setCargando(true);
    setError("");
    return Promise.all([notificacionesApi.listar(true), dashboardApi.resumen()])
      .then(([notifs, dashboard]) => {
        setNotificaciones(notifs);
        setEntregablesAtencion(dashboard.entregables_atencion || []);
        const hoy = new Date();
        setReunionesHoy(
          (dashboard.reuniones_proximas || []).filter((r) => {
            const f = new Date(r.fecha_inicio);
            return (
              f.getFullYear() === hoy.getFullYear() &&
              f.getMonth() === hoy.getMonth() &&
              f.getDate() === hoy.getDate()
            );
          })
        );
      })
      .catch(() => setError("No se pudieron cargar los pendientes."))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar, recargarSenal]);

  const marcarConcluido = async (entregableId) => {
    setMarcandoId(entregableId);
    try {
      await entregablesApi.actualizarAvance(entregableId, 100);
      await cargar();
    } catch {
      setError("No se pudo marcar como concluido.");
    } finally {
      setMarcandoId(null);
    }
  };

  if (cargando) return <p>Cargando pendientes...</p>;
  if (error) return <p className="error-text">{error}</p>;

  const vencidos = entregablesAtencion.filter((e) => e.urgencia === "vencido");
  const proximos = entregablesAtencion.filter((e) => e.urgencia !== "vencido");

  const totalPendientes = notificaciones.length + reunionesHoy.length;

  return (
    <div className="card">
      <h2 style={{ fontSize: "1rem", marginBottom: 12 }}>Pendientes / Por hacer</h2>

      {totalPendientes === 0 && entregablesAtencion.length === 0 && (
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
          No tienes pendientes urgentes por ahora.
        </p>
      )}

      <div className="stack" style={{ gap: 6 }}>
        {vencidos.map((e) => (
          <FilaPendiente
            key={`venc-${e.id}`}
            urgente={e.urgente}
            entregableId={e.id}
            marcando={marcandoId === e.id}
            onMarcarConcluido={marcarConcluido}
          >
            <Link to={`/app/proyectos/${e.proyecto_id}?entregable=${e.id}`}>
              "{e.nombre}" de {e.responsable_nombre} ya venció ({e.proyecto_nombre})
            </Link>
          </FilaPendiente>
        ))}

        {proximos.map((e) => (
          <FilaPendiente
            key={`prox-${e.id}`}
            urgente={e.urgente}
            entregableId={e.id}
            marcando={marcandoId === e.id}
            onMarcarConcluido={marcarConcluido}
          >
            <Link to={`/app/proyectos/${e.proyecto_id}?entregable=${e.id}`}>
              "{e.nombre}" de {e.responsable_nombre} vence pronto ({e.proyecto_nombre})
            </Link>
          </FilaPendiente>
        ))}

        {reunionesHoy.map((r) => (
          <FilaPendiente key={`reu-${r.id}`} urgente>
            <Link to={`/app/proyectos/${r.proyecto_id}?reunion=${r.id}`}>
              Reunión "{r.titulo}" con {r.organizador_nombre} — hoy
            </Link>
          </FilaPendiente>
        ))}

        {notificaciones.map((n) => (
          <FilaPendiente key={`notif-${n.id}`} urgente={n.urgente}>
            {n.mensaje}
          </FilaPendiente>
        ))}
      </div>
    </div>
  );
}

function FilaPendiente({ urgente, children, entregableId, marcando, onMarcarConcluido }) {
  return (
    <div className="planb__pendiente-fila">
      {urgente && <BadgeUrgente urgente={urgente} />}
      <span style={{ flex: 1 }}>{children}</span>
      {entregableId != null && (
        <button
          type="button"
          className="btn btn--ghost"
          style={{ fontSize: "0.75rem", padding: "2px 8px" }}
          disabled={marcando}
          onClick={() => onMarcarConcluido(entregableId)}
          title="Marcar como concluido"
        >
          {marcando ? "..." : "✓ Concluido"}
        </button>
      )}
    </div>
  );
}

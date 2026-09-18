import { useCallback, useEffect, useState } from "react";
import { dashboardApi, entregablesApi, notificacionesApi } from "../../api/endpoints";
import { useEventosTiempoReal } from "../../hooks/useEventosTiempoReal";
import BadgeUrgente from "../BadgeUrgente";
import { IconoCheck } from "./IconosPlanB";

// "Pendientes / Por hacer" de Agenda Plan B (2026-08-20) -- no hay endpoint
// nuevo: se componen las frases en el frontend a partir de datos que YA
// existen (notificaciones no leídas + entregables_atencion/reuniones_
// proximas de GET /dashboard/resumen), para no duplicar lógica de negocio
// que el backend ya calcula (es_urgente, urgencia vencido/próximo). Se
// recarga cuando `recargarSenal` cambia (AgendaPlanB.jsx lo incrementa
// después de crear una tarea/proyecto).
export default function PendientesUrgentes({ recargarSenal, onAbrirEntregable, onAbrirReunion }) {
  const [notificaciones, setNotificaciones] = useState([]);
  const [entregablesAtencion, setEntregablesAtencion] = useState([]);
  const [reunionesHoy, setReunionesHoy] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  // Marcar concluido es por-fila (2026-08-20, a petición de Yue: "un clic
  // directo, sin confirmar") -- se deshabilita solo el botón de ESA fila
  // mientras corre, no toda la lista.
  const [marcandoId, setMarcandoId] = useState(null);

  // `silencioso` (2026-08-21, tiempo real): al recargar por un evento en
  // vivo (alguien más asignó/completó algo), no queremos que la lista
  // entera parpadee a "Cargando pendientes..." -- solo se ve ese estado
  // en la carga inicial/manual, mismo patrón que ya usaba `recargarSenal`.
  const cargar = useCallback(({ silencioso = false } = {}) => {
    if (!silencioso) setCargando(true);
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
      .finally(() => {
        if (!silencioso) setCargando(false);
      });
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar, recargarSenal]);

  // Tiempo real (2026-08-21): cualquier Notificacion nueva para este
  // usuario (alguien le asignó algo, marcó algo como completado que lo
  // afecta, etc.) dispara un recargar silencioso -- ver
  // app/services/eventos_tiempo_real.py en el backend.
  useEventosTiempoReal(() => cargar({ silencioso: true }));

  // Fix real (2026-08-21, reporte de Yue probando el flujo completo:
  // "al dar check no desaparecen, y se duplican"): marcar el % de avance
  // en 100 saca al entregable de entregables_atencion (eso ya funcionaba),
  // pero las NOTIFICACIONES ya generadas sobre ese mismo entregable ("te
  // asignó X", "vence en N días", "está VENCIDO" -- una por día, ver
  // generar_recordatorios en el backend, es diseño intencional de
  // recordatorio diario) seguían sin marcarse como leídas, así que
  // reaparecían solas como filas sueltas después de completar la tarea.
  // Se marcan aquí como leídas todas las notificaciones no leídas del
  // mismo entregable al completarlo -- no hace falta un endpoint nuevo,
  // ya existe PATCH /notificaciones/{id} para marcar una por una.
  const marcarConcluido = async (entregableId) => {
    setMarcandoId(entregableId);
    try {
      await entregablesApi.actualizarAvance(entregableId, 100);
      const notifsDelEntregable = notificaciones.filter(
        (n) => n.entregable_id === entregableId
      );
      await Promise.all(
        notifsDelEntregable.map((n) => notificacionesApi.marcarLeida(n.id).catch(() => {}))
      );
      await cargar();
    } catch (err) {
      // Fila desactualizada (2026-09-18) -- si el backend dice que ya
      // estaba concluida (ver el guard nuevo en actualizar_avance), no es
      // un error real que mostrar: solo hay que refrescar para que la fila
      // vieja desaparezca, en vez de asustar con un mensaje rojo por algo
      // que ya estaba bien.
      if (err.response?.status === 400 && err.response?.data?.detail?.includes("ya fue concluida")) {
        await cargar();
      } else {
        setError(err.response?.data?.detail || "No se pudo marcar como concluido.");
      }
    } finally {
      setMarcandoId(null);
    }
  };

  if (cargando) return <p>Cargando pendientes...</p>;
  if (error) return <p className="error-text">{error}</p>;

  const vencidos = entregablesAtencion.filter((e) => e.urgencia === "vencido");
  const proximos = entregablesAtencion.filter((e) => e.urgencia !== "vencido");

  // Dedup real (2026-08-21, reporte de Yue: "si es urgente aparecen como
  // urgente pero también salen duplicada"): un entregable urgente/próximo
  // a vencer ya se muestra UNA vez, arriba, con su link + botón de
  // concluir + barra de progreso reales (vencidos/proximos). Las
  // notificaciones tipo recordatorio del MISMO entregable (una por día,
  // ver generar_recordatorios) repetían la misma información como filas
  // sueltas debajo -- se ocultan aquí para no mostrar dos veces lo mismo.
  // Mismo criterio para reuniones de hoy (notificación reunion_hoy vs.
  // fila propia de reunionesHoy). Notificaciones sin ese respaldo (una
  // asignación de hace días que ya no está "en atención", una nota, un
  // cumpleaños) se siguen mostrando normal.
  const idsEntregableMostrado = new Set(entregablesAtencion.map((e) => e.id));
  const idsReunionMostrada = new Set(reunionesHoy.map((r) => r.id));
  const notificacionesVisibles = notificaciones.filter((n) => {
    // Los cumpleaños (mensaje con emoji "🎂", ver
    // app/services/recordatorios.py::_mensaje_cumpleanos) no son un
    // "pendiente / por hacer" -- se muestran en otro lado, no aquí
    // (2026-08-21, a petición de Yue).
    if (typeof n.mensaje === "string" && n.mensaje.startsWith("🎂")) return false;
    if (n.entregable_id != null) return !idsEntregableMostrado.has(n.entregable_id);
    if (n.reunion_id != null) return !idsReunionMostrada.has(n.reunion_id);
    return true;
  });

  const totalPendientes = notificacionesVisibles.length + reunionesHoy.length;

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
            avance={e.porcentaje_avance}
            marcando={marcandoId === e.id}
            onMarcarConcluido={marcarConcluido}
          >
            <button
              type="button"
              className="planb__enlace-simple"
              onClick={() => onAbrirEntregable?.(e.proyecto_id, e.id)}
            >
              "{e.nombre}" de {e.responsable_nombre} ya venció ({e.proyecto_nombre})
            </button>
          </FilaPendiente>
        ))}

        {proximos.map((e) => (
          <FilaPendiente
            key={`prox-${e.id}`}
            urgente={e.urgente}
            entregableId={e.id}
            avance={e.porcentaje_avance}
            marcando={marcandoId === e.id}
            onMarcarConcluido={marcarConcluido}
          >
            <button
              type="button"
              className="planb__enlace-simple"
              onClick={() => onAbrirEntregable?.(e.proyecto_id, e.id)}
            >
              "{e.nombre}" de {e.responsable_nombre} vence pronto ({e.proyecto_nombre})
            </button>
          </FilaPendiente>
        ))}

        {reunionesHoy.map((r) => (
          <FilaPendiente key={`reu-${r.id}`} urgente>
            <button
              type="button"
              className="planb__enlace-simple"
              onClick={() => onAbrirReunion?.(r.proyecto_id, r.id)}
            >
              Reunión "{r.titulo}" con {r.organizador_nombre} — hoy
            </button>
          </FilaPendiente>
        ))}

        {notificacionesVisibles.map((n) => {
          // Clickeable + botón de concluir (2026-08-21, reporte real de
          // Yue: "Bernardo le asignó una tarea a David" no tenía ni link
          // ni botón, a diferencia de las filas de arriba) -- el backend
          // ahora resuelve proyecto_id para notificaciones ligadas a un
          // entregable o reunión (ver NotificacionOut.proyecto_id). Sin
          // proyecto_id (notificación genérica, sin entregable/reunión
          // detrás) se queda como texto plano, igual que antes.
          const contenido = n.proyecto_id ? (
            <button
              type="button"
              className="planb__enlace-simple"
              onClick={() =>
                n.entregable_id
                  ? onAbrirEntregable?.(n.proyecto_id, n.entregable_id)
                  : onAbrirReunion?.(n.proyecto_id, n.reunion_id)
              }
            >
              {n.mensaje}
            </button>
          ) : (
            n.mensaje
          );
          return (
            <FilaPendiente
              key={`notif-${n.id}`}
              urgente={n.urgente}
              entregableId={n.entregable_id}
              marcando={marcandoId === n.entregable_id}
              onMarcarConcluido={marcarConcluido}
            >
              {contenido}
            </FilaPendiente>
          );
        })}
      </div>
    </div>
  );
}

function FilaPendiente({ urgente, children, entregableId, avance, marcando, onMarcarConcluido }) {
  return (
    <div className="planb__pendiente-fila">
      {urgente && <BadgeUrgente urgente={urgente} />}
      <span style={{ flex: 1 }}>
        {children}
        {/* Barra de progreso con el % real de avance del entregable
            (2026-08-21, diseño "grafito") -- oculta por CSS en los demás
            estilos, ver app.css. Solo se renderiza si el dato viene (no
            aplica a reuniones/notificaciones, que no tienen avance). */}
        {avance != null && (
          <div className="planb__pendiente-progreso">
            <div
              className="planb__pendiente-progreso-fill"
              style={{ width: `${avance}%` }}
            />
          </div>
        )}
      </span>
      {entregableId != null && (
        <>
          {/* Diseño clásico: botón de texto, sin cambios. */}
          <button
            type="button"
            className="btn btn--ghost planb__pendiente-boton-clasico"
            style={{ fontSize: "0.75rem", padding: "2px 8px" }}
            disabled={marcando}
            onClick={() => onMarcarConcluido(entregableId)}
            title="Marcar como concluido"
          >
            {marcando ? "..." : "✓ Concluido"}
          </button>
          {/* Diseño nuevo (réplica exacta): icono-solo, oculto en clásico
              vía CSS -- ver app.css. */}
          <button
            type="button"
            className="planb__pendiente-accion"
            disabled={marcando}
            onClick={() => onMarcarConcluido(entregableId)}
            title="Marcar como concluido"
            aria-label="Marcar como concluido"
          >
            <IconoCheck />
          </button>
        </>
      )}
    </div>
  );
}

import { useState } from "react";
import { notificacionesApi } from "../api/endpoints";
import Modal from "./Modal";

const ETIQUETA_TIPO = {
  recordatorio_proximo: "Recordatorio",
  recordatorio_vencido: "Vencido",
  entregable_asignado: "Asignación",
  avance_actualizado: "Avance",
  reunion_hoy: "Reunión hoy",
  otro: "Aviso",
};

// Los vencidos/urgentes se destacan en rojo (mismo peso visual que tenía
// "Urgente" antes de unificarse con las notificaciones reales); el resto
// usa el teal/gris genérico de siempre. 2026-08-20, a petición del
// cliente: n.urgente (marcado explícito o calculado por fecha, ver
// Entregable.urgente_manual/es_urgente) pesa igual que un vencido.
function colorBadge(n) {
  if (n.leida) return { background: "var(--color-pending-bg)", color: "var(--color-text-muted)" };
  if (n.tipo === "recordatorio_vencido" || n.urgente) {
    return { background: "var(--color-danger)", color: "#fff" };
  }
  return { background: "var(--color-teal-500)", color: "#fff" };
}

// Todas las notificaciones (vencidos/próximos, reuniones de hoy,
// cumpleaños, asignaciones, avances) son filas reales de Notificacion —
// generadas por el barrido de app/services/recordatorios.py — así que
// todas pasan por el mismo camino de marcar leída/eliminar. Antes existía
// una capa aparte de items "Urgente" calculados en vivo (useRequiereAtencion)
// sin esas opciones; se retiró en favor de esta lista única al extender el
// backend para que también genere notificación real de esos casos.
export default function ModalNotificaciones({ notificaciones, onCambio, onCerrar }) {
  const [verLeidas, setVerLeidas] = useState(false);
  const [leidas, setLeidas] = useState([]);
  const [cargandoLeidas, setCargandoLeidas] = useState(false);

  const marcarLeida = async (id) => {
    await notificacionesApi.marcarLeida(id);
    await onCambio();
  };

  const eliminar = async (id) => {
    await notificacionesApi.eliminar(id);
    await onCambio();
    if (verLeidas) await cargarLeidas();
  };

  const cargarLeidas = async () => {
    setCargandoLeidas(true);
    try {
      const todas = await notificacionesApi.listar(false);
      setLeidas(todas.filter((n) => n.leida));
    } finally {
      setCargandoLeidas(false);
    }
  };

  const alternarVerLeidas = async () => {
    if (!verLeidas) await cargarLeidas();
    setVerLeidas((v) => !v);
  };

  return (
    <Modal titulo="Notificaciones" onCerrar={onCerrar}>
      <div className="stack">
        {notificaciones.length === 0 && (
          <p style={{ color: "var(--color-text-muted)" }}>No tienes notificaciones.</p>
        )}
        {notificaciones.map((n) => (
          <div
            key={n.id}
            className="list-inline"
            style={{
              alignItems: "flex-start",
              gap: 8,
              border: n.urgente && !n.leida ? "1px solid var(--color-danger)" : undefined,
              borderRadius: n.urgente && !n.leida ? 8 : undefined,
              padding: n.urgente && !n.leida ? 8 : undefined,
            }}
          >
            <div>
              <span
                className="badge"
                style={{ ...colorBadge(n), marginRight: 8 }}
              >
                {n.urgente && !n.leida ? "URGENTE" : ETIQUETA_TIPO[n.tipo] || n.tipo}
              </span>
              <span style={{ fontSize: "0.88rem" }}>{n.mensaje}</span>
              <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                {new Date(n.fecha_creacion).toLocaleString("es-MX")}
              </div>
            </div>
            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
              {!n.leida && (
                <button className="btn btn--ghost" onClick={() => marcarLeida(n.id)}>
                  Marcar leída
                </button>
              )}
              <button className="btn btn--ghost" onClick={() => eliminar(n.id)}>
                Eliminar
              </button>
            </div>
          </div>
        ))}

        {notificaciones.length > 0 && (
          <button
            className="btn btn--ghost"
            style={{ alignSelf: "flex-start" }}
            onClick={alternarVerLeidas}
            disabled={cargandoLeidas}
          >
            {verLeidas ? "Ocultar leídas" : "Ver leídas"}
          </button>
        )}

        {verLeidas && (
          <div className="stack">
            {leidas.length === 0 && !cargandoLeidas && (
              <p style={{ color: "var(--color-text-muted)" }}>No hay avisos leídos.</p>
            )}
            {leidas.map((n) => (
              <div key={n.id} className="list-inline" style={{ alignItems: "flex-start", gap: 8 }}>
                <div>
                  <span
                    className="badge"
                    style={{
                      background: "var(--color-pending-bg)",
                      color: "var(--color-text-muted)",
                      marginRight: 8,
                    }}
                  >
                    {ETIQUETA_TIPO[n.tipo] || n.tipo}
                  </span>
                  <span style={{ fontSize: "0.88rem" }}>{n.mensaje}</span>
                  <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                    {new Date(n.fecha_creacion).toLocaleString("es-MX")}
                  </div>
                </div>
                <button className="btn btn--ghost" onClick={() => eliminar(n.id)}>
                  Eliminar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

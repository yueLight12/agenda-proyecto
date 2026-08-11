import { notificacionesApi } from "../api/endpoints";
import Modal from "./Modal";

const ETIQUETA_TIPO = {
  recordatorio_proximo: "Recordatorio",
  recordatorio_vencido: "Vencido",
  entregable_asignado: "Asignación",
  avance_actualizado: "Avance",
  otro: "Aviso",
};

export default function ModalNotificaciones({ notificaciones, onCambio, onCerrar }) {
  const marcarLeida = async (id) => {
    await notificacionesApi.marcarLeida(id);
    await onCambio();
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
            style={{ alignItems: "flex-start", gap: 8 }}
          >
            <div>
              <span
                className="badge"
                style={{
                  background: n.leida ? "var(--color-pending-bg)" : "var(--color-teal-500)",
                  color: n.leida ? "var(--color-text-muted)" : "#fff",
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
            {!n.leida && (
              <button className="btn btn--ghost" onClick={() => marcarLeida(n.id)}>
                Marcar leída
              </button>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}

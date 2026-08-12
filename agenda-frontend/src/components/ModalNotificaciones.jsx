import { Link } from "react-router-dom";
import { notificacionesApi } from "../api/endpoints";
import { fechaLocal, textoDiasRelativos } from "../utils/fechas";
import Modal from "./Modal";

const ETIQUETA_TIPO = {
  recordatorio_proximo: "Recordatorio",
  recordatorio_vencido: "Vencido",
  entregable_asignado: "Asignación",
  avance_actualizado: "Avance",
  otro: "Aviso",
};

// Arma, a partir de lo que ya calcula useRequiereAtencion (ver
// AppLayout.jsx), una lista de filas normalizadas — mismo look que una
// notificación, pero con etiqueta "Urgente" en vez del tipo, para
// mostrarlas dentro de este mismo modal. Experimento pedido por Yue: antes
// que un botón separado junto a "Notificaciones", primero probar mezclarlo
// aquí; si no convence, se separa a su propio botón/panel.
function itemsDeAtencion({ vencidos, proximos, reunionesHoy, cumpleanosProximos }) {
  const items = [];

  for (const e of vencidos) {
    items.push({
      key: `atencion-entregable-${e.id}`,
      texto: `${e.nombre} — ${e.proyecto_nombre} (${e.responsable_nombre})`,
      detalle: `venció el ${fechaLocal(e.fecha_entrega).toLocaleDateString("es-MX", { dateStyle: "medium" })} · ${textoDiasRelativos(e.fecha_entrega)}`,
      link: `/proyectos/${e.proyecto_id}`,
    });
  }
  for (const e of proximos) {
    items.push({
      key: `atencion-entregable-${e.id}`,
      texto: `${e.nombre} — ${e.proyecto_nombre} (${e.responsable_nombre})`,
      detalle: `vence el ${fechaLocal(e.fecha_entrega).toLocaleDateString("es-MX", { dateStyle: "medium" })} · ${textoDiasRelativos(e.fecha_entrega)}`,
      link: `/proyectos/${e.proyecto_id}`,
    });
  }
  for (const r of reunionesHoy) {
    items.push({
      key: `atencion-reunion-${r.id}`,
      texto: `${r.titulo} — ${r.proyecto_nombre}`,
      detalle: `hoy a las ${new Date(r.fecha_inicio).toLocaleTimeString("es-MX", { timeStyle: "short" })}`,
      link: `/proyectos/${r.proyecto_id}`,
    });
  }
  for (const c of cumpleanosProximos) {
    items.push({
      key: `atencion-cumpleanos-${c.id}`,
      texto: `🎂 Cumpleaños de ${c.nombre}`,
      detalle: new Date(c.fecha + "T00:00:00").toLocaleDateString("es-MX", { dateStyle: "medium" }),
      link: null,
    });
  }
  return items;
}

export default function ModalNotificaciones({
  notificaciones,
  onCambio,
  onCerrar,
  vencidos = [],
  proximos = [],
  reunionesHoy = [],
  cumpleanosProximos = [],
}) {
  const marcarLeida = async (id) => {
    await notificacionesApi.marcarLeida(id);
    await onCambio();
  };

  const atencion = itemsDeAtencion({ vencidos, proximos, reunionesHoy, cumpleanosProximos });

  return (
    <Modal titulo="Notificaciones" onCerrar={onCerrar}>
      <div className="stack">
        {notificaciones.length === 0 && atencion.length === 0 && (
          <p style={{ color: "var(--color-text-muted)" }}>No tienes notificaciones.</p>
        )}
        {atencion.map((item) => {
          const contenido = (
            <>
              <span
                className="badge"
                style={{ background: "var(--color-danger)", color: "#fff", marginRight: 8 }}
              >
                Urgente
              </span>
              <span style={{ fontSize: "0.88rem" }}>{item.texto}</span>
              <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>{item.detalle}</div>
            </>
          );
          return (
            <div key={item.key} className="list-inline" style={{ alignItems: "flex-start", gap: 8 }}>
              {item.link ? (
                <Link to={item.link} style={{ textDecoration: "none", color: "inherit" }} onClick={onCerrar}>
                  {contenido}
                </Link>
              ) : (
                <div>{contenido}</div>
              )}
            </div>
          );
        })}
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

import { useEffect, useState } from "react";
import { equipoResumenApi, seriesReunionApi } from "../api/endpoints";
import { fechaLocal, textoRangoSemana } from "../utils/fechas";

const ETIQUETA_ESTADO = {
  revisado: "Revisado",
  revisado_con_pendientes: "Revisado, con pendientes nuevos",
  pendiente: "Sigue pendiente",
};

// YYYY-MM-DD en horario LOCAL (no toISOString, que corta en UTC y puede
// mandar el día equivocado del otro lado de medianoche).
function fechaIsoLocal(fecha) {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, "0");
  const d = String(fecha.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// `onRevertido` (2026-08-18, a petición de Yue: "si un tema se marcó
// revisado por error, ¿cómo se revierte?") -- solo se pasa para la sección
// "Revisado esta semana", donde cada fila trae `agenda_item_id`. Vuelve a
// dejar el tema pendiente en su junta original (mismo mecanismo que
// "+ Agregar tema a esta agenda" en SeccionAgendaChecklist) sin borrar
// este registro histórico -- por eso la fila se queda en la lista tal cual
// hasta que se recargue la semana.
function Fila({ evento, onRevertido }) {
  const [revirtiendo, setRevirtiendo] = useState(false);
  const [error, setError] = useState("");

  const handleRevertir = async () => {
    setRevirtiendo(true);
    setError("");
    try {
      await seriesReunionApi.revertirRevisado(evento.agenda_item_id);
      await onRevertido();
    } catch (err) {
      setError(err.response?.data?.detail || "No se pudo revertir.");
      setRevirtiendo(false);
    }
  };

  return (
    <div style={{ padding: "8px 0", borderBottom: "1px solid var(--color-border)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <strong>{evento.tema_nombre}</strong>
        <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
          {evento.junta_titulo}
        </span>
      </div>
      {(evento.usuario_nombre || evento.estado) && (
        <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span>
            {evento.usuario_nombre && `${evento.usuario_nombre} — `}
            {ETIQUETA_ESTADO[evento.estado] || ""}
          </span>
          {onRevertido && evento.agenda_item_id != null && (
            <button
              type="button"
              className="btn btn--ghost"
              style={{ fontSize: "0.72rem", padding: "2px 8px", whiteSpace: "nowrap" }}
              onClick={handleRevertir}
              disabled={revirtiendo}
            >
              {revirtiendo ? "Revirtiendo..." : "↩ Revertir"}
            </button>
          )}
        </div>
      )}
      {evento.nota && (
        <div style={{ fontSize: "0.85rem", marginTop: 4 }}>
          <em>&ldquo;{evento.nota}&rdquo;</em>
        </div>
      )}
      {error && <p className="error-text" style={{ fontSize: "0.78rem", margin: "4px 0 0" }}>{error}</p>}
    </div>
  );
}

function Seccion({ titulo, eventos, vacio, onRevertido }) {
  return (
    <div className="card" style={{ marginTop: 12 }}>
      <h3 style={{ marginTop: 0 }}>{titulo}</h3>
      {eventos.length === 0 ? (
        <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>{vacio}</p>
      ) : (
        eventos.map((e, i) => <Fila key={i} evento={e} onRevertido={onRevertido} />)
      )}
    </div>
  );
}

export default function HistorialMinutas() {
  const [fechaRef, setFechaRef] = useState(new Date());
  const [historial, setHistorial] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const cargar = () => {
    setCargando(true);
    setError("");
    return equipoResumenApi
      .historialSemana(fechaIsoLocal(fechaRef))
      .then(setHistorial)
      .catch(() => setError("No se pudo cargar el historial de esta semana."))
      .finally(() => setCargando(false));
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fechaRef]);

  const cambiarSemana = (delta) => {
    const siguiente = new Date(fechaRef);
    siguiente.setDate(siguiente.getDate() + delta * 7);
    setFechaRef(siguiente);
  };

  return (
    <div className="stack">
      <div className="topbar">
        <h2 style={{ margin: 0 }}>
          {historial ? `Minuta — Semana ${historial.numero_semana}` : "Minuta"}
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="btn btn--ghost" type="button" onClick={() => cambiarSemana(-1)}>
            ◀
          </button>
          <span style={{ fontSize: "0.9rem", color: "var(--color-text-muted)" }}>
            {historial
              ? textoRangoSemana({
                  inicio: fechaLocal(historial.fecha_inicio),
                  fin: fechaLocal(historial.fecha_fin),
                })
              : ""}
          </span>
          <button className="btn btn--ghost" type="button" onClick={() => cambiarSemana(1)}>
            ▶
          </button>
        </div>
      </div>

      {cargando && <p>Cargando...</p>}
      {error && <p className="error-text">{error}</p>}

      {historial && !cargando && (
        <>
          <Seccion
            titulo={`Revisado esta semana (${historial.revisados.length})`}
            eventos={historial.revisados}
            vacio="Nada revisado esta semana."
            onRevertido={cargar}
          />
          <Seccion
            titulo={`Nuevo esta semana (${historial.nuevos.length})`}
            eventos={historial.nuevos}
            vacio="Nada nuevo esta semana."
          />
          <Seccion
            titulo={`Sigue pendiente (${historial.pendientes.length})`}
            eventos={historial.pendientes}
            vacio="Nada pendiente al cierre de esta semana."
          />
        </>
      )}
    </div>
  );
}

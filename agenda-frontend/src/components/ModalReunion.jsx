import { useState } from "react";
import { reunionesApi } from "../api/endpoints";
import { etiquetaRol } from "../utils/rolLabels";
import ConfirmDialog from "./ConfirmDialog";
import Modal from "./Modal";
import SeccionAgendaChecklist from "./SeccionAgendaChecklist";
import SeccionNotas from "./SeccionNotas";

function aFechaYHora(fechaISO) {
  if (!fechaISO) return { fecha: "", hora: "" };
  const d = new Date(fechaISO);
  const fecha = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
  const hora = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return { fecha, hora };
}

/**
 * Alta/edición de una reunión. `miembros` es el equipo visible del proyecto
 * (mismo formato que usa ModalEquipo/FormularioEntregable) para elegir participantes.
 * Una reunión es visible solo para organizador + invitados (y siempre para el N1).
 */
export default function ModalReunion({
  proyectoId,
  reunion,
  miembros,
  organizadorId,
  puedeAdministrar = false,
  onGuardado,
  onCerrar,
}) {
  const esEdicion = Boolean(reunion);
  const { fecha: fechaInicial, hora: horaInicial } = aFechaYHora(reunion?.fecha_inicio);

  const [titulo, setTitulo] = useState(reunion?.titulo || "");
  const [notas, setNotas] = useState(reunion?.notas || "");
  const [fecha, setFecha] = useState(fechaInicial);
  const [hora, setHora] = useState(horaInicial || "09:00");
  const [duracionMinutos, setDuracionMinutos] = useState(reunion?.duracion_minutos || 30);
  const [participantesIds, setParticipantesIds] = useState(
    reunion?.participantes?.map((p) => p.usuario_id) || []
  );
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(false);

  const puedeEliminar = esEdicion; // ambos, N1/N2/organizador, validado por el backend

  const toggleParticipante = (usuarioId) => {
    setParticipantesIds((prev) =>
      prev.includes(usuarioId) ? prev.filter((id) => id !== usuarioId) : [...prev, usuarioId]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setGuardando(true);
    const datos = {
      titulo,
      notas: notas || null,
      fecha_inicio: `${fecha}T${hora}:00`,
      duracion_minutos: Number(duracionMinutos),
      participantes_ids: participantesIds,
    };
    try {
      if (esEdicion) {
        await reunionesApi.actualizar(reunion.id, datos);
      } else {
        await reunionesApi.crear(proyectoId, datos);
      }
      onGuardado();
    } catch (err) {
      setError(err.response?.data?.detail || "No se pudo guardar la reunión.");
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminar = async () => {
    setConfirmandoEliminar(false);
    setEliminando(true);
    try {
      await reunionesApi.eliminar(reunion.id);
      onGuardado();
    } catch {
      setError("No se pudo eliminar la reunión.");
      setEliminando(false);
    }
  };

  const invitables = miembros.filter((m) => m.usuario_id !== organizadorId);

  return (
    <Modal titulo={esEdicion ? "Editar reunión" : "Nueva reunión"} onCerrar={onCerrar}>
      <form className="stack" onSubmit={handleSubmit}>
        <label className="stack" style={{ gap: 4 }}>
          <span style={{ fontSize: "0.85rem" }}>Título</span>
          <input className="input" value={titulo} onChange={(e) => setTitulo(e.target.value)} required />
        </label>

        <div style={{ display: "flex", gap: 8 }}>
          <label className="stack" style={{ gap: 4, flex: 1 }}>
            <span style={{ fontSize: "0.85rem" }}>Fecha</span>
            <input
              className="input"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              required
            />
          </label>
          <label className="stack" style={{ gap: 4, flex: 1 }}>
            <span style={{ fontSize: "0.85rem" }}>Hora</span>
            <input
              className="input"
              type="time"
              value={hora}
              onChange={(e) => setHora(e.target.value)}
              required
            />
          </label>
          <label className="stack" style={{ gap: 4, width: 110 }}>
            <span style={{ fontSize: "0.85rem" }}>Duración (min)</span>
            <input
              className="input"
              type="number"
              min={5}
              step={5}
              value={duracionMinutos}
              onChange={(e) => setDuracionMinutos(e.target.value)}
              required
            />
          </label>
        </div>

        <label className="stack" style={{ gap: 4 }}>
          <span style={{ fontSize: "0.85rem" }}>Notas (opcional)</span>
          <input className="input" value={notas} onChange={(e) => setNotas(e.target.value)} />
        </label>

        <div className="stack" style={{ gap: 4 }}>
          <span style={{ fontSize: "0.85rem" }}>Invitados</span>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.78rem", margin: 0 }}>
            {proyectoId
              ? "Solo el organizador, los invitados y la dirección podrán ver esta reunión."
              : "Reunión general (sin tema) — solo el organizador y los invitados podrán verla."}
          </p>
          <div className="stack" style={{ gap: 4, maxHeight: 160, overflowY: "auto" }}>
            {invitables.map((m) => (
              <label key={m.usuario_id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={participantesIds.includes(m.usuario_id)}
                  onChange={() => toggleParticipante(m.usuario_id)}
                />
                <span style={{ fontSize: "0.88rem" }}>
                  {m.nombre} {m.puesto ? `— ${m.puesto}` : ""} ({etiquetaRol(m.rol)})
                </span>
              </label>
            ))}
            {invitables.length === 0 && (
              <span style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
                No hay más miembros visibles para invitar.
              </span>
            )}
          </div>
        </div>

        {error && <p className="error-text">{error}</p>}

        <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
          {puedeEliminar ? (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setConfirmandoEliminar(true)}
              disabled={eliminando}
              style={{ color: "var(--color-danger)" }}
            >
              {eliminando ? "Eliminando..." : "Eliminar"}
            </button>
          ) : (
            <span />
          )}
          <button className="btn btn--primary" type="submit" disabled={guardando}>
            {guardando ? "Guardando..." : esEdicion ? "Guardar cambios" : "Agendar reunión"}
          </button>
        </div>
      </form>

      {esEdicion && (
        <div style={{ marginTop: 16, borderTop: "1px solid var(--color-border)", paddingTop: 16 }}>
          <SeccionNotas reunionId={reunion.id} temaId={proyectoId} puedeAdministrar={puedeAdministrar} />
        </div>
      )}

      {esEdicion && <SeccionAgendaChecklist reunionId={reunion.id} />}

      {confirmandoEliminar && (
        <ConfirmDialog
          titulo="Eliminar reunión"
          mensaje="¿Eliminar esta reunión?"
          onConfirmar={handleEliminar}
          onCancelar={() => setConfirmandoEliminar(false)}
        />
      )}
    </Modal>
  );
}

import { useState } from "react";
import { seriesReunionApi } from "../api/endpoints";
import { etiquetaRol } from "../utils/rolLabels";
import ConfirmDialog from "./ConfirmDialog";
import Modal from "./Modal";
import SeccionAgendaChecklist from "./SeccionAgendaChecklist";

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

/**
 * Alta/edición de una junta recurrente (Fase 2/3, 2026-08-17): día de la
 * semana + hora en vez de una fecha única -- sus ocurrencias se agendan
 * solas (ver app/services/materializar_series.py). Al crearla, el mismo
 * modal se queda abierto y se convierte en el panel de "Agenda de esta
 * junta" (ver SeccionAgendaChecklist.jsx, compartido con reuniones
 * sueltas) -- la lista persistente de temas/pendientes que se revisan en
 * cada ocurrencia, con lo no revisado arrastrándose a la siguiente.
 *
 * Ampliado 2026-08-17 (caso Diana): una junta puede ser general
 * (proyectoId=null) con puntos agrupados por sección (tema/subtema). `proyectoId`
 * puede venir null (junta general).
 */
export default function ModalSerieReunion({ proyectoId = null, serie = null, miembros, onGuardado, onCerrar }) {
  const esEdicion = Boolean(serie);
  const [serieActual, setSerieActual] = useState(serie);
  const [titulo, setTitulo] = useState(serie?.titulo || "");
  const [diaSemana, setDiaSemana] = useState(serie?.dia_semana ?? 0);
  const [hora, setHora] = useState(serie?.hora ? serie.hora.slice(0, 5) : "10:00");
  const [duracionMinutos, setDuracionMinutos] = useState(serie?.duracion_minutos || 30);
  const [participantesIds, setParticipantesIds] = useState(
    serie?.participantes?.map((p) => p.usuario_id) || []
  );
  const [fechaInicio] = useState(serie?.fecha_inicio || new Date().toISOString().slice(0, 10));
  const [activa, setActiva] = useState(serie?.activa ?? true);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(false);

  const toggleParticipante = (usuarioId) => {
    setParticipantesIds((prev) =>
      prev.includes(usuarioId) ? prev.filter((id) => id !== usuarioId) : [...prev, usuarioId]
    );
  };

  const handleGuardar = async (e) => {
    e.preventDefault();
    setError("");
    setGuardando(true);
    try {
      if (esEdicion) {
        const actualizada = await seriesReunionApi.actualizar(serieActual.id, {
          titulo,
          dia_semana: Number(diaSemana),
          hora: `${hora}:00`,
          duracion_minutos: Number(duracionMinutos),
          participantes_ids: participantesIds,
          activa,
        });
        setSerieActual(actualizada);
      } else {
        const nueva = await seriesReunionApi.crear({
          proyecto_id: proyectoId,
          titulo,
          dia_semana: Number(diaSemana),
          hora: `${hora}:00`,
          duracion_minutos: Number(duracionMinutos),
          participantes_ids: participantesIds,
          fecha_inicio: fechaInicio,
        });
        setSerieActual(nueva);
      }
      await onGuardado();
    } catch (err) {
      setError(err.response?.data?.detail || "No se pudo guardar la junta recurrente.");
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminar = async () => {
    setConfirmandoEliminar(false);
    setEliminando(true);
    try {
      await seriesReunionApi.eliminar(serieActual.id);
      await onGuardado();
      onCerrar();
    } catch {
      setError("No se pudo eliminar la junta recurrente.");
      setEliminando(false);
    }
  };

  const mostrarFormulario = !serieActual || esEdicion;

  return (
    <Modal
      titulo={
        esEdicion ? "Editar junta recurrente" : serieActual ? "Junta recurrente creada" : "Nueva junta recurrente"
      }
      onCerrar={onCerrar}
    >
      <div className="stack">
        {mostrarFormulario && (
          <form className="stack" onSubmit={handleGuardar}>
            <label className="stack" style={{ gap: 4 }}>
              <span style={{ fontSize: "0.85rem" }}>Título</span>
              <input className="input" value={titulo} onChange={(e) => setTitulo(e.target.value)} required />
            </label>

            <div style={{ display: "flex", gap: 8 }}>
              <label className="stack" style={{ gap: 4, flex: 1 }}>
                <span style={{ fontSize: "0.85rem" }}>Día de la semana</span>
                <select className="input" value={diaSemana} onChange={(e) => setDiaSemana(e.target.value)}>
                  {DIAS.map((d, i) => (
                    <option key={i} value={i}>
                      {d}
                    </option>
                  ))}
                </select>
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

            <div className="stack" style={{ gap: 4 }}>
              <span style={{ fontSize: "0.85rem" }}>Invitados</span>
              <div className="stack" style={{ gap: 4, maxHeight: 140, overflowY: "auto" }}>
                {miembros.map((m) => (
                  <label key={m.usuario_id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={participantesIds.includes(m.usuario_id)}
                      onChange={() => toggleParticipante(m.usuario_id)}
                    />
                    <span style={{ fontSize: "0.88rem" }}>
                      {m.nombre} {m.rol ? `(${etiquetaRol(m.rol)})` : ""}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {esEdicion && (
              <label className="list-inline" style={{ borderBottom: "none", paddingBottom: 0 }}>
                <span style={{ fontSize: "0.85rem" }}>Junta activa</span>
                <input type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} />
              </label>
            )}

            {error && <p className="error-text">{error}</p>}

            <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
              {esEdicion ? (
                <button
                  type="button"
                  className="btn btn--ghost"
                  style={{ color: "var(--color-danger)" }}
                  onClick={() => setConfirmandoEliminar(true)}
                  disabled={eliminando}
                >
                  {eliminando ? "Eliminando..." : "Eliminar"}
                </button>
              ) : (
                <span />
              )}
              <button className="btn btn--primary" type="submit" disabled={guardando}>
                {guardando ? "Guardando..." : esEdicion ? "Guardar cambios" : "Crear"}
              </button>
            </div>
          </form>
        )}

        {!mostrarFormulario && serieActual && (
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
            "{serieActual.titulo}" quedó agendada todos los {DIAS[serieActual.dia_semana]} a las {hora}. Sus
            próximas ocurrencias se agendan solas.
          </p>
        )}

        {serieActual && <SeccionAgendaChecklist serieId={serieActual.id} />}
      </div>

      {confirmandoEliminar && (
        <ConfirmDialog
          titulo="Eliminar junta recurrente"
          mensaje="¿Eliminar esta junta recurrente? Las ocurrencias ya agendadas se quedan como reuniones sueltas, no se borran."
          textoConfirmar={eliminando ? "Eliminando..." : "Eliminar"}
          onConfirmar={handleEliminar}
          onCancelar={() => setConfirmandoEliminar(false)}
        />
      )}
    </Modal>
  );
}

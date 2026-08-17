import { useEffect, useState } from "react";
import { proyectosApi, seriesReunionApi } from "../api/endpoints";
import { etiquetaRol } from "../utils/rolLabels";
import ConfirmDialog from "./ConfirmDialog";
import Modal from "./Modal";

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

const ETIQUETAS_ESTADO = {
  revisado: "revisado",
  pendiente: "pendiente",
  revisado_con_pendientes: "revisado, con pendientes nuevos",
};

/**
 * Alta/edición de una junta recurrente (Fase 2/3, 2026-08-17): día de la
 * semana + hora en vez de una fecha única -- sus ocurrencias se agendan
 * solas (ver app/services/materializar_series.py). Al crearla, el mismo
 * modal se queda abierto y se convierte en el panel de "Agenda de esta
 * junta" -- la lista persistente de temas/pendientes que se revisan en
 * cada ocurrencia, con lo no revisado arrastrándose a la siguiente.
 */
export default function ModalSerieReunion({ proyectoId, serie = null, miembros, onGuardado, onCerrar }) {
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

  const [agenda, setAgenda] = useState([]);
  const [cargandoAgenda, setCargandoAgenda] = useState(false);
  const [subtemas, setSubtemas] = useState([]);
  const [nuevoItemTipo, setNuevoItemTipo] = useState("pendiente");
  const [nuevoItemProyectoId, setNuevoItemProyectoId] = useState("");
  const [nuevoItemTexto, setNuevoItemTexto] = useState("");
  const [agregandoItem, setAgregandoItem] = useState(false);

  const cargarAgenda = async (id) => {
    setCargandoAgenda(true);
    try {
      const [ag, hijos] = await Promise.all([
        seriesReunionApi.agenda(id),
        proyectosApi.hijos(proyectoId),
      ]);
      setAgenda(ag);
      setSubtemas(hijos);
    } catch {
      setError("No se pudo cargar la agenda de esta junta.");
    } finally {
      setCargandoAgenda(false);
    }
  };

  useEffect(() => {
    if (serieActual) cargarAgenda(serieActual.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serieActual?.id]);

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

  const handleAgregarItem = async (e) => {
    e.preventDefault();
    setError("");
    setAgregandoItem(true);
    try {
      const datos =
        nuevoItemTipo === "tema"
          ? { tipo: "tema", proyecto_id: Number(nuevoItemProyectoId) }
          : { tipo: "pendiente", texto: nuevoItemTexto };
      await seriesReunionApi.agregarItemAgenda(serieActual.id, datos);
      setNuevoItemTexto("");
      setNuevoItemProyectoId("");
      await cargarAgenda(serieActual.id);
    } catch (err) {
      setError(err.response?.data?.detail || "No se pudo agregar el ítem.");
    } finally {
      setAgregandoItem(false);
    }
  };

  const handleQuitarItem = async (itemId) => {
    setError("");
    try {
      await seriesReunionApi.archivarItemAgenda(itemId);
      await cargarAgenda(serieActual.id);
    } catch {
      setError("No se pudo quitar el ítem.");
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
                      {m.nombre} ({etiquetaRol(m.rol)})
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

        {serieActual && (
          <div className="stack" style={{ borderTop: "1px solid var(--color-border)", paddingTop: 12 }}>
            <h3 style={{ fontSize: "0.9rem", margin: 0 }}>Agenda de esta junta</h3>
            <p style={{ color: "var(--color-text-muted)", fontSize: "0.78rem", margin: 0 }}>
              Lo que agregues aquí se revisa en cada ocurrencia — lo que no se revise sigue pendiente la
              próxima vez.
            </p>

            {cargandoAgenda && <p style={{ fontSize: "0.85rem" }}>Cargando...</p>}
            {!cargandoAgenda && agenda.length === 0 && (
              <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
                Todavía no hay ítems en la agenda.
              </p>
            )}
            {agenda.map((item) => (
              <div key={item.id} className="list-inline" style={{ padding: "4px 0" }}>
                <span style={{ fontSize: "0.85rem" }}>
                  {item.nombre}{" "}
                  <span style={{ color: "var(--color-text-muted)", fontSize: "0.78rem" }}>
                    — {ETIQUETAS_ESTADO[item.estado_actual] || item.estado_actual}
                  </span>
                </span>
                <button
                  type="button"
                  className="btn btn--ghost"
                  style={{ fontSize: "0.72rem", padding: "2px 6px" }}
                  onClick={() => handleQuitarItem(item.id)}
                >
                  Quitar
                </button>
              </div>
            ))}

            <form className="stack" onSubmit={handleAgregarItem} style={{ gap: 6 }}>
              <select
                className="input"
                value={nuevoItemTipo}
                onChange={(e) => setNuevoItemTipo(e.target.value)}
              >
                <option value="pendiente">Pendiente (texto libre)</option>
                <option value="tema">Subtema de este tema</option>
              </select>
              {nuevoItemTipo === "tema" ? (
                <select
                  className="input"
                  value={nuevoItemProyectoId}
                  onChange={(e) => setNuevoItemProyectoId(e.target.value)}
                  required
                  disabled={subtemas.length === 0}
                >
                  <option value="" disabled>
                    {subtemas.length === 0 ? "Este tema no tiene subtemas todavía" : "Selecciona un subtema"}
                  </option>
                  {subtemas.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="input"
                  placeholder="Describe el pendiente"
                  value={nuevoItemTexto}
                  onChange={(e) => setNuevoItemTexto(e.target.value)}
                  required
                />
              )}
              <button
                className="btn btn--ghost"
                type="submit"
                disabled={agregandoItem}
                style={{ alignSelf: "flex-start" }}
              >
                {agregandoItem ? "Agregando..." : "Agregar a la agenda"}
              </button>
            </form>
          </div>
        )}
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

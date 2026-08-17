import { useState } from "react";
import { reunionesApi, seriesReunionApi } from "../api/endpoints";
import BuscadorInvitados from "./BuscadorInvitados";
import ConfirmDialog from "./ConfirmDialog";
import Modal from "./Modal";
import SeccionAgendaChecklist from "./SeccionAgendaChecklist";
import SeccionNotas from "./SeccionNotas";

const DIAS_ES = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const DIAS_ES_CAP = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

function aFechaYHora(fechaISO) {
  if (!fechaISO) return { fecha: "", hora: "" };
  const d = new Date(fechaISO);
  const fecha = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
  const hora = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return { fecha, hora };
}

// JS Date.getDay(): 0=domingo...6=sábado. Backend (datetime.weekday()):
// 0=lunes...6=domingo. Conversión de un lado al otro.
function diaSemanaDesdeFecha(fechaStr) {
  const d = new Date(`${fechaStr}T00:00:00`);
  return (d.getDay() + 6) % 7;
}

/**
 * Alta/edición de una reunión, unificado (2026-08-17, a petición de Yue:
 * "todas las reuniones deberían funcionar muy parecidas") -- antes eran
 * dos modales separados (ModalReunion para sueltas, ModalSerieReunion
 * para recurrentes). Al CREAR, un selector "Repetir" decide si se crea
 * una Reunion suelta o una SerieReunion (diaria/semanal/mensual, el día
 * de la semana/mes se calcula solo de la fecha elegida, como en Teams).
 * Al EDITAR, el modal ya sabe si edita una Reunion (`reunion`) o una
 * SerieReunion (`serie`) por cuál de las dos props recibe -- no se puede
 * cambiar de una a otra ni cambiar el patrón de recurrencia ya creado,
 * solo cuándo/quién/cuánto dura.
 *
 * Como con ModalSerieReunion antes, guardar NO cierra el modal (deja ver
 * el checklist de la reunión/serie recién creada o editada) -- solo
 * "Cerrar" o eliminar lo hacen.
 */
export default function ModalReunion({
  proyectoId = null,
  reunion = null,
  serie = null,
  miembros,
  organizadorId,
  puedeAdministrar = false,
  onGuardado,
  onCerrar,
}) {
  const esEdicionReunion = Boolean(reunion);
  const esEdicionSerie = Boolean(serie);
  const esEdicion = esEdicionReunion || esEdicionSerie;
  const { fecha: fechaInicial, hora: horaInicial } = aFechaYHora(reunion?.fecha_inicio);

  const [reunionActual, setReunionActual] = useState(reunion);
  const [serieActual, setSerieActual] = useState(serie);

  const [titulo, setTitulo] = useState(reunion?.titulo || serie?.titulo || "");
  const [notas, setNotas] = useState(reunion?.notas || "");
  const [fecha, setFecha] = useState(fechaInicial || new Date().toISOString().slice(0, 10));
  const [hora, setHora] = useState(horaInicial || serie?.hora?.slice(0, 5) || "09:00");
  const [duracionMinutos, setDuracionMinutos] = useState(
    reunion?.duracion_minutos || serie?.duracion_minutos || 30
  );
  const [participantesIds, setParticipantesIds] = useState(
    reunion?.participantes?.map((p) => p.usuario_id) ||
      serie?.participantes?.map((p) => p.usuario_id) ||
      []
  );
  const [activa, setActiva] = useState(serie?.activa ?? true);
  // Edición de una serie ya creada: el patrón (tipo_recurrencia) no
  // cambia, pero el día sí -- separado de "repetir" (que solo aplica al
  // CREAR).
  const [diaSemanaEdit, setDiaSemanaEdit] = useState(serie?.dia_semana ?? 0);
  const [diaMesEdit, setDiaMesEdit] = useState(serie?.dia_mes ?? 1);

  // Solo aplica al crear: "no" | "diaria" | "semanal" | "mensual".
  const [repetir, setRepetir] = useState("no");

  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(false);

  const puedeEliminar = esEdicion; // ambos, N1/N2/organizador, validado por el backend
  const invitables = miembros.filter((m) => m.usuario_id !== organizadorId);

  const toggleParticipante = (ids) => setParticipantesIds(ids);

  const handleGuardar = async (e) => {
    e.preventDefault();
    setError("");
    setGuardando(true);
    try {
      if (esEdicionSerie) {
        const datos = {
          titulo,
          hora: `${hora}:00`,
          duracion_minutos: Number(duracionMinutos),
          participantes_ids: participantesIds,
          activa,
        };
        if (serieActual.tipo_recurrencia === "semanal") datos.dia_semana = Number(diaSemanaEdit);
        if (serieActual.tipo_recurrencia === "mensual") datos.dia_mes = Number(diaMesEdit);
        const actualizada = await seriesReunionApi.actualizar(serieActual.id, datos);
        setSerieActual(actualizada);
      } else if (esEdicionReunion) {
        const actualizada = await reunionesApi.actualizar(reunionActual.id, {
          titulo,
          notas: notas || null,
          fecha_inicio: `${fecha}T${hora}:00`,
          duracion_minutos: Number(duracionMinutos),
          participantes_ids: participantesIds,
        });
        setReunionActual(actualizada);
      } else if (repetir === "no") {
        const nueva = await reunionesApi.crear(proyectoId, {
          titulo,
          notas: notas || null,
          fecha_inicio: `${fecha}T${hora}:00`,
          duracion_minutos: Number(duracionMinutos),
          participantes_ids: participantesIds,
        });
        setReunionActual(nueva);
      } else {
        const nueva = await seriesReunionApi.crear({
          proyecto_id: proyectoId,
          titulo,
          tipo_recurrencia: repetir,
          dia_semana: repetir === "semanal" ? diaSemanaDesdeFecha(fecha) : undefined,
          dia_mes: repetir === "mensual" ? Number(fecha.split("-")[2]) : undefined,
          hora: `${hora}:00`,
          duracion_minutos: Number(duracionMinutos),
          participantes_ids: participantesIds,
          fecha_inicio: fecha,
        });
        setSerieActual(nueva);
      }
      await onGuardado();
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
      if (esEdicionSerie) await seriesReunionApi.eliminar(serieActual.id);
      else await reunionesApi.eliminar(reunionActual.id);
      await onGuardado();
      onCerrar();
    } catch {
      setError(esEdicionSerie ? "No se pudo eliminar la junta recurrente." : "No se pudo eliminar la reunión.");
      setEliminando(false);
    }
  };

  const yaCreado = Boolean(reunionActual || serieActual);
  const mostrarFormulario = !yaCreado || esEdicion;

  const tituloModal = esEdicionSerie
    ? "Editar junta recurrente"
    : esEdicionReunion
    ? "Editar reunión"
    : yaCreado
    ? "Reunión creada"
    : "Nueva reunión";

  return (
    <Modal titulo={tituloModal} onCerrar={onCerrar}>
      <div className="stack">
        {mostrarFormulario && (
          <form className="stack" onSubmit={handleGuardar}>
            <label className="stack" style={{ gap: 4 }}>
              <span style={{ fontSize: "0.85rem" }}>Título</span>
              <input className="input" value={titulo} onChange={(e) => setTitulo(e.target.value)} required />
            </label>

            {!esEdicionSerie && (
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
            )}

            {esEdicionSerie && (
              <div style={{ display: "flex", gap: 8 }}>
                {serieActual.tipo_recurrencia === "semanal" && (
                  <label className="stack" style={{ gap: 4, flex: 1 }}>
                    <span style={{ fontSize: "0.85rem" }}>Día de la semana</span>
                    <select className="input" value={diaSemanaEdit} onChange={(e) => setDiaSemanaEdit(e.target.value)}>
                      {DIAS_ES_CAP.map((d, i) => (
                        <option key={i} value={i}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {serieActual.tipo_recurrencia === "mensual" && (
                  <label className="stack" style={{ gap: 4, flex: 1 }}>
                    <span style={{ fontSize: "0.85rem" }}>Día del mes</span>
                    <input
                      className="input"
                      type="number"
                      min={1}
                      max={31}
                      value={diaMesEdit}
                      onChange={(e) => setDiaMesEdit(e.target.value)}
                      required
                    />
                  </label>
                )}
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
            )}

            {!esEdicion && (
              <label className="stack" style={{ gap: 4 }}>
                <span style={{ fontSize: "0.85rem" }}>Repetir</span>
                <select className="input" value={repetir} onChange={(e) => setRepetir(e.target.value)}>
                  <option value="no">No se repite</option>
                  <option value="diaria">Cada día</option>
                  <option value="semanal">Cada semana los {fecha ? DIAS_ES[diaSemanaDesdeFecha(fecha)] : "..."}</option>
                  <option value="mensual">Cada mes el día {fecha ? Number(fecha.split("-")[2]) : "..."}</option>
                </select>
              </label>
            )}

            {!esEdicionSerie && repetir === "no" && (
              <label className="stack" style={{ gap: 4 }}>
                <span style={{ fontSize: "0.85rem" }}>Notas (opcional)</span>
                <input className="input" value={notas} onChange={(e) => setNotas(e.target.value)} />
              </label>
            )}

            {esEdicionSerie && (
              <label className="list-inline" style={{ borderBottom: "none", paddingBottom: 0 }}>
                <span style={{ fontSize: "0.85rem" }}>Junta activa</span>
                <input type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} />
              </label>
            )}

            <div className="stack" style={{ gap: 4 }}>
              <span style={{ fontSize: "0.85rem" }}>Invitados</span>
              <p style={{ color: "var(--color-text-muted)", fontSize: "0.78rem", margin: 0 }}>
                {proyectoId
                  ? "Solo el organizador, los invitados y la dirección podrán ver esta reunión."
                  : "Reunión general (sin tema) — solo el organizador y los invitados podrán verla."}
              </p>
              <BuscadorInvitados
                candidatos={invitables}
                seleccionadosIds={participantesIds}
                onCambiar={toggleParticipante}
              />
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
        )}

        {!mostrarFormulario && yaCreado && (
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
            {serieActual
              ? `"${serieActual.titulo}" quedó agendada. Sus próximas ocurrencias se agendan solas.`
              : `"${reunionActual.titulo}" quedó agendada.`}
          </p>
        )}

        {reunionActual && (
          <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 16 }}>
            <SeccionNotas reunionId={reunionActual.id} temaId={proyectoId} puedeAdministrar={puedeAdministrar} />
          </div>
        )}

        {reunionActual && <SeccionAgendaChecklist reunionId={reunionActual.id} />}
        {serieActual && <SeccionAgendaChecklist serieId={serieActual.id} />}
      </div>

      {confirmandoEliminar && (
        <ConfirmDialog
          titulo={esEdicionSerie ? "Eliminar junta recurrente" : "Eliminar reunión"}
          mensaje={
            esEdicionSerie
              ? "¿Eliminar esta junta recurrente? Las ocurrencias ya agendadas se quedan como reuniones sueltas, no se borran."
              : "¿Eliminar esta reunión?"
          }
          textoConfirmar={eliminando ? "Eliminando..." : "Eliminar"}
          onConfirmar={handleEliminar}
          onCancelar={() => setConfirmandoEliminar(false)}
        />
      )}
    </Modal>
  );
}

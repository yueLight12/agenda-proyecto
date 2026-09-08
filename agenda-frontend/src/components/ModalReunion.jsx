import { useRef, useState } from "react";
import { reunionesApi, seriesReunionApi } from "../api/endpoints";
import { esFinDeSemana } from "../utils/finDeSemana";
import BuscadorInvitados from "./BuscadorInvitados";
import ConfirmDialog from "./ConfirmDialog";
import Modal from "./Modal";
import ModalAsignarTareaRapida from "./ModalAsignarTareaRapida";
import ModalFinDeSemana from "./ModalFinDeSemana";
import SeccionAgendaChecklist from "./SeccionAgendaChecklist";
import SeccionNotas from "./SeccionNotas";
import SelectorTemasChecklist from "./SelectorTemasChecklist";

// Recordatorio in-app opcional antes de la reunión (2026-08-25, a petición
// de Yue) -- lista preestablecida en vez de un número libre. El scheduler
// que manda el recordatorio barre cada varias horas (ver
// app/main.py::horas_entre_barridos_recordatorios en el backend), así que
// "15/30 min antes" puede llegar tarde -- aceptado por Yue por ahora,
// pendiente acortar ese barrido antes de producción si se necesita
// precisión real.
const RECORDATORIO_OPCIONES = [
  { valor: "", etiqueta: "Sin recordatorio" },
  { valor: 15, etiqueta: "15 minutos antes" },
  { valor: 30, etiqueta: "30 minutos antes" },
  { valor: 60, etiqueta: "1 hora antes" },
  { valor: 120, etiqueta: "2 horas antes" },
  { valor: 1440, etiqueta: "1 día antes" },
];

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
  // Fecha/hora prellenada al crear (2026-08-22, calendario tipo Teams):
  // viene de arrastrar una franja en semana/día (desktop, ver onSelectSlot
  // en CalendarioEntregables) o de tocar el encabezado de un día en la
  // vista Agenda (móvil, ver onDiaClick en VistaAgendaSemanal) -- en ese
  // segundo caso `hora` viene null (solo se conoce el día), y cae al
  // default de abajo. Se ignora si `reunion`/`serie` ya traen su propia
  // fecha (edición).
  fechaHoraSugerida = null,
  // "Asignar tarea" desde una reunión (2026-08-27, a petición de Yue) --
  // opcional a propósito: solo Agenda Plan B lo pasa hoy (tiene ya cargado
  // su `equipo` de /mi-equipo con el detalle de proyectos por persona que
  // ModalAsignarTareaRapida necesita para el selector de tema). Sin este
  // prop el botón simplemente no aparece -- CalendarioGlobal.jsx y
  // TableroProyecto.jsx (sistema viejo) siguen sin él, sin romper nada.
  equipoDisponible = null,
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
  const [notas, setNotas] = useState(reunion?.notas || serie?.notas || "");
  // "" en el <select> = sin recordatorio (Number("") es NaN, se normaliza a
  // null al guardar) -- ver RECORDATORIO_OPCIONES abajo.
  const [recordatorioMinutosAntes, setRecordatorioMinutosAntes] = useState(
    reunion?.recordatorio_minutos_antes ?? serie?.recordatorio_minutos_antes ?? ""
  );
  const [fecha, setFecha] = useState(
    fechaInicial || fechaHoraSugerida?.fecha || new Date().toISOString().slice(0, 10)
  );
  const [hora, setHora] = useState(
    horaInicial || serie?.hora?.slice(0, 5) || fechaHoraSugerida?.hora || "09:00"
  );
  const [duracionMinutos, setDuracionMinutos] = useState(
    reunion?.duracion_minutos || serie?.duracion_minutos || fechaHoraSugerida?.duracionMinutos || 30
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
  // Solo aplica al eliminar una serie (2026-08-18, a petición de Yue: "si
  // quiero eliminarla, dame la opción de eliminar todas las reuniones que
  // salieron de esa reunión recurrente, así no tengo que eliminar una por
  // una") -- default false, para no sorprender a nadie borrando historial
  // de golpe sin haberlo pedido explícitamente.
  const [eliminarOcurrencias, setEliminarOcurrencias] = useState(false);
  // Mismo checkbox que arriba, pero para cuando se elimina desde una
  // OCURRENCIA puntual (clic en el calendario) que resulta pertenecer a
  // una serie -- ofrece borrar la junta recurrente completa sin tener que
  // ir a buscarla aparte. Default false, mismo criterio de no sorprender.
  const [eliminarSerieCompleta, setEliminarSerieCompleta] = useState(false);
  // Fuerza a SeccionAgendaChecklist a recargar tras guardar los temas
  // elegidos -- más simple que exponer su `cargar` interno.
  const [versionChecklist, setVersionChecklist] = useState(0);

  // "Asignar tarea" desde esta reunión (2026-08-27) -- solo participantes
  // reales (organizador + invitados) que además estén en `equipoDisponible`
  // (a quién YO puedo administrar/asignar, mismo criterio que ya usa
  // ModalAsignarTareaRapida en el resto de Plan B, no una regla nueva).
  const [mostrarAsignarTarea, setMostrarAsignarTarea] = useState(false);
  const participantesAsignables = (equipoDisponible || []).filter(
    (m) => participantesIds.includes(m.usuario_id) || m.usuario_id === reunionActual?.organizador_id
  );

  // Asistencia (2026-08-27, a petición de Yue) -- clic directo, sin
  // confirmar, mismo criterio que "Marcar concluida" en FormularioEntregable.
  // Clicar el mismo estado ya marcado lo deshace (manda null = "no tomada").
  const [marcandoAsistenciaDe, setMarcandoAsistenciaDe] = useState(null);
  const handleMarcarAsistencia = async (usuarioIdParticipante, nuevoValor) => {
    setMarcandoAsistenciaDe(usuarioIdParticipante);
    try {
      const actualizado = await reunionesApi.actualizarAsistencia(
        reunionActual.id, usuarioIdParticipante, nuevoValor
      );
      setReunionActual((actual) => ({
        ...actual,
        participantes: actual.participantes.map((p) =>
          p.usuario_id === usuarioIdParticipante ? { ...p, asistio: actualizado.asistio } : p
        ),
      }));
    } catch {
      setError("No se pudo actualizar la asistencia.");
    } finally {
      setMarcandoAsistenciaDe(null);
    }
  };

  const puedeEliminar = esEdicion; // ambos, N1/N2/organizador, validado por el backend

  // Botón "Reagendar" (2026-08-25, a petición de Yue): solo mueve la
  // fecha/hora de ESTA reunión -- no aplica a la edición de una serie
  // completa (ahí "hora"/"día" son el patrón recurrente, no una ocurrencia).
  const fechaInputRef = useRef(null);
  const handleReagendar = () => {
    fechaInputRef.current?.focus();
    fechaInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // El checklist (temas/agenda) SIEMPRE vive en la serie cuando la junta
  // es una ocurrencia materializada -- bug real encontrado 2026-08-18: al
  // hacer clic en una ocurrencia desde el calendario, este modal solo
  // recibe `reunion` (no `serie`), así que sin este cálculo el checklist
  // se armaba anclado a ESA ocurrencia puntual (reunion_id) en vez de a la
  // serie -- duplicaba todo (una copia por ocurrencia) y rompía la promesa
  // central de "no hay que volver a agregar los temas cada semana".
  // reunionActual.serie_id ya viene en ReunionOut aunque el modal no haya
  // recibido el objeto `serie` completo.
  const serieIdAgenda = serieActual?.id ?? reunionActual?.serie_id ?? null;
  const reunionIdAgenda = serieIdAgenda ? null : reunionActual?.id ?? null;
  const invitables = miembros.filter((m) => m.usuario_id !== organizadorId);

  const toggleParticipante = (ids) => setParticipantesIds(ids);

  // Aviso de fin de semana (2026-09-02, a petición de Yue) -- solo aplica
  // cuando hay una fecha puntual de por medio (edición de una reunión o
  // creación sin repetir); una serie recurrente (semanal/mensual) no tiene
  // "una fecha", tiene un patrón, así que queda fuera a propósito.
  const [confirmandoFinDeSemana, setConfirmandoFinDeSemana] = useState(false);

  const guardar = async (fechaFinal) => {
    setError("");
    setGuardando(true);
    const recordatorioAEnviar =
      recordatorioMinutosAntes === "" ? null : Number(recordatorioMinutosAntes);
    try {
      if (esEdicionSerie) {
        const datos = {
          titulo,
          notas: notas || null,
          hora: `${hora}:00`,
          duracion_minutos: Number(duracionMinutos),
          participantes_ids: participantesIds,
          recordatorio_minutos_antes: recordatorioAEnviar,
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
          fecha_inicio: `${fechaFinal}T${hora}:00`,
          duracion_minutos: Number(duracionMinutos),
          participantes_ids: participantesIds,
          recordatorio_minutos_antes: recordatorioAEnviar,
        });
        setReunionActual(actualizada);
      } else if (repetir === "no") {
        const nueva = await reunionesApi.crear(proyectoId, {
          titulo,
          notas: notas || null,
          fecha_inicio: `${fechaFinal}T${hora}:00`,
          duracion_minutos: Number(duracionMinutos),
          participantes_ids: participantesIds,
          recordatorio_minutos_antes: recordatorioAEnviar,
        });
        setReunionActual(nueva);
      } else {
        const nueva = await seriesReunionApi.crear({
          proyecto_id: proyectoId,
          titulo,
          notas: notas || null,
          tipo_recurrencia: repetir,
          dia_semana: repetir === "semanal" ? diaSemanaDesdeFecha(fecha) : undefined,
          dia_mes: repetir === "mensual" ? Number(fecha.split("-")[2]) : undefined,
          hora: `${hora}:00`,
          duracion_minutos: Number(duracionMinutos),
          participantes_ids: participantesIds,
          fecha_inicio: fecha,
          recordatorio_minutos_antes: recordatorioAEnviar,
        });
        setSerieActual(nueva);
      }
      // Fuerza a SeccionAgendaChecklist a remontar y volver a pedir la
      // agenda + temas relevantes (2026-08-18, bug reportado por Yue: al
      // invitar a alguien nuevo -- ej. Diana -- y guardar, "Agenda de esta
      // junta" seguía mostrando lo cargado en el primer render, así que el
      // selector "+ Agregar tema a esta agenda" nunca se enteraba de los
      // temas que la nueva invitada destapó).
      setVersionChecklist((v) => v + 1);
      await onGuardado();
    } catch (err) {
      setError(err.response?.data?.detail || "No se pudo guardar la reunión.");
    } finally {
      setGuardando(false);
    }
  };

  const handleGuardar = async (e) => {
    e.preventDefault();
    const requiereFechaPuntual = !esEdicionSerie && (esEdicionReunion || repetir === "no");
    if (requiereFechaPuntual && esFinDeSemana(fecha)) {
      setConfirmandoFinDeSemana(true);
      return;
    }
    await guardar(fecha);
  };

  const handleElegirFinDeSemana = async (fechaFinal) => {
    setConfirmandoFinDeSemana(false);
    if (fechaFinal !== fecha) setFecha(fechaFinal);
    await guardar(fechaFinal);
  };

  const handleEliminar = async () => {
    setConfirmandoEliminar(false);
    setEliminando(true);
    try {
      if (esEdicionSerie) {
        await seriesReunionApi.eliminar(serieActual.id, eliminarOcurrencias);
      } else if (esEdicionReunion && reunionActual.serie_id && eliminarSerieCompleta) {
        // Ocurrencia de una serie, pero el usuario pidió borrar la junta
        // recurrente completa desde aquí mismo -- no hace falta pasar por
        // la lista de "Juntas recurrentes" para llegar a esta opción.
        await seriesReunionApi.eliminar(reunionActual.serie_id, true);
      } else {
        await reunionesApi.eliminar(reunionActual.id);
      }
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
          <form id="form-reunion" className="stack" onSubmit={handleGuardar}>
            <label className="stack" style={{ gap: 4 }}>
              <span style={{ fontSize: "0.85rem" }}>Título</span>
              <input className="input" value={titulo} onChange={(e) => setTitulo(e.target.value)} required />
            </label>

            {!esEdicionSerie && (
              <div style={{ display: "flex", gap: 8 }}>
                <label className="stack" style={{ gap: 4, flex: 1 }}>
                  <span style={{ fontSize: "0.85rem" }}>Fecha</span>
                  <input
                    ref={fechaInputRef}
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

            <label className="stack" style={{ gap: 4 }}>
              <span style={{ fontSize: "0.85rem" }}>Notas (opcional)</span>
              <input className="input" value={notas} onChange={(e) => setNotas(e.target.value)} />
            </label>

            <label className="stack" style={{ gap: 4 }}>
              <span style={{ fontSize: "0.85rem" }}>Recordatorio</span>
              <select
                className="input"
                value={recordatorioMinutosAntes}
                onChange={(e) => setRecordatorioMinutosAntes(e.target.value)}
              >
                {RECORDATORIO_OPCIONES.map((op) => (
                  <option key={op.valor} value={op.valor}>
                    {op.etiqueta}
                  </option>
                ))}
              </select>
            </label>

            {esEdicionSerie && (
              <label className="list-inline" style={{ borderBottom: "none", paddingBottom: 0 }}>
                <span style={{ fontSize: "0.85rem" }}>Junta activa</span>
                <input type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} />
              </label>
            )}

            {esEdicion && (reunionActual?.organizador_nombre || serieActual?.organizador_nombre) && (
              <p style={{ fontSize: "0.85rem", margin: 0 }}>
                <strong>Organiza:</strong>{" "}
                {reunionActual?.organizador_nombre || serieActual?.organizador_nombre}
              </p>
            )}

            <div className="stack" style={{ gap: 4 }}>
              <span style={{ fontSize: "0.85rem" }}>Invitados</span>
              <p style={{ color: "var(--color-text-muted)", fontSize: "0.78rem", margin: 0 }}>
                {proyectoId
                  ? "Solo el organizador, los invitados y la dirección podrán ver esta reunión."
                  : "Reunión general (sin proyecto) — solo el organizador y los invitados podrán verla."}
              </p>
              <BuscadorInvitados
                candidatos={invitables}
                seleccionadosIds={participantesIds}
                onCambiar={toggleParticipante}
              />
            </div>

            {error && <p className="error-text">{error}</p>}
          </form>
        )}

        {!mostrarFormulario && yaCreado && (
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
            {serieActual
              ? `"${serieActual.titulo}" quedó agendada. Sus próximas ocurrencias se agendan solas.`
              : `"${reunionActual.titulo}" quedó agendada.`}
          </p>
        )}

        {reunionActual && reunionActual.participantes.length > 0 && (
          <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 16 }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Asistencia</span>
            <p style={{ color: "var(--color-text-muted)", fontSize: "0.78rem", margin: "2px 0 8px" }}>
              Cualquier invitado puede marcarla, no solo quien organiza.
            </p>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              {reunionActual.participantes.map((p) => (
                <li
                  key={p.usuario_id}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}
                >
                  <span style={{ fontSize: "0.85rem" }}>{p.nombre}</span>
                  <span style={{ display: "flex", gap: 4 }}>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      disabled={marcandoAsistenciaDe === p.usuario_id}
                      onClick={() => handleMarcarAsistencia(p.usuario_id, p.asistio === true ? null : true)}
                      style={
                        p.asistio === true
                          ? { color: "var(--color-success)", borderColor: "var(--color-success)" }
                          : undefined
                      }
                    >
                      ✓ Asistió
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      disabled={marcandoAsistenciaDe === p.usuario_id}
                      onClick={() => handleMarcarAsistencia(p.usuario_id, p.asistio === false ? null : false)}
                      style={
                        p.asistio === false
                          ? { color: "var(--color-danger)", borderColor: "var(--color-danger)" }
                          : undefined
                      }
                    >
                      ✗ No asistió
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {reunionActual && (
          <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 16 }}>
            <SeccionNotas
              reunionId={reunionActual.id}
              temaId={proyectoId}
              puedeAdministrar={puedeAdministrar}
              tituloPersonalizado="Notas"
              placeholderTexto="Escribe aquí tus notas..."
              textoVacio="Escribe aquí tus notas."
            />
          </div>
        )}

        {(reunionActual || serieActual) && (
          <SelectorTemasChecklist
            // El árbol que ofrece el selector depende de quién organiza +
            // quién está invitado (ver backend: temas-relevantes) --
            // forzamos un remount (y por tanto un refetch) cuando cambia
            // el organizador o la lista de invitados YA GUARDADA, para
            // que no se quede con la lista de temas de antes de invitar a
            // alguien nuevo.
            key={`${serieIdAgenda || reunionIdAgenda}-${
              (serieActual || reunionActual)?.organizador_id
            }-${((serieActual || reunionActual)?.participantes || [])
              .map((p) => p.usuario_id)
              .sort()
              .join(",")}`}
            serieId={serieIdAgenda}
            reunionId={reunionIdAgenda}
            defaultTodos
            inline
            oculto
            onGuardado={async () => setVersionChecklist((v) => v + 1)}
          />
        )}

        {serieIdAgenda && <SeccionAgendaChecklist key={versionChecklist} serieId={serieIdAgenda} />}
        {!serieIdAgenda && reunionIdAgenda && (
          <SeccionAgendaChecklist key={versionChecklist} reunionId={reunionIdAgenda} />
        )}

        {/* Botones al final del modal, después de notas/checklist (2026-09-01,
            a petición de Yue) -- "Guardar cambios" sigue enviando el <form>
            de arriba vía el atributo form= (HTML5 permite asociar un botón a
            un <form> aunque esté fuera de su árbol). */}
        {mostrarFormulario && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 8 }}>
            <div>
              {puedeEliminar && (
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setConfirmandoEliminar(true)}
                  disabled={eliminando}
                  style={{ color: "var(--color-danger)" }}
                >
                  {eliminando ? "Eliminando..." : "Eliminar"}
                </button>
              )}
            </div>
            <div style={{ justifySelf: "center", display: "flex", gap: 8 }}>
              {esEdicionReunion && (
                <button type="button" className="btn btn--ghost" onClick={handleReagendar}>
                  Reagendar
                </button>
              )}
              {esEdicionReunion && equipoDisponible && (
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setMostrarAsignarTarea(true)}
                  disabled={participantesAsignables.length === 0}
                  title={
                    participantesAsignables.length === 0
                      ? "Ninguno de los participantes está en tu equipo para asignarle tareas"
                      : undefined
                  }
                >
                  Asignar tarea
                </button>
              )}
            </div>
            <div style={{ justifySelf: "end" }}>
              <button className="btn btn--primary" type="submit" form="form-reunion" disabled={guardando}>
                {guardando ? "Guardando..." : esEdicion ? "Guardar cambios" : "Agendar reunión"}
              </button>
            </div>
          </div>
        )}
      </div>

      {confirmandoEliminar && (
        <ConfirmDialog
          titulo={esEdicionSerie ? "Eliminar junta recurrente" : "Eliminar reunión"}
          mensaje={
            esEdicionSerie
              ? "¿Eliminar esta junta recurrente?"
              : "¿Eliminar esta reunión?"
          }
          textoConfirmar={eliminando ? "Eliminando..." : "Eliminar"}
          onConfirmar={handleEliminar}
          onCancelar={() => setConfirmandoEliminar(false)}
        >
          {esEdicionSerie && (
            <label className="list-inline" style={{ borderBottom: "none", padding: 0, alignItems: "center" }}>
              <span style={{ fontSize: "0.85rem" }}>
                También eliminar las ocurrencias ya agendadas de esta junta (si no, se quedan
                como reuniones sueltas con su historial intacto)
              </span>
              <input
                type="checkbox"
                checked={eliminarOcurrencias}
                onChange={(e) => setEliminarOcurrencias(e.target.checked)}
              />
            </label>
          )}
          {esEdicionReunion && reunionActual.serie_id && (
            <label className="list-inline" style={{ borderBottom: "none", padding: 0, alignItems: "center" }}>
              <span style={{ fontSize: "0.85rem" }}>
                Esta reunión es parte de una junta recurrente — eliminar también todas sus
                demás ocurrencias (si no, solo se borra esta)
              </span>
              <input
                type="checkbox"
                checked={eliminarSerieCompleta}
                onChange={(e) => setEliminarSerieCompleta(e.target.checked)}
              />
            </label>
          )}
        </ConfirmDialog>
      )}

      {mostrarAsignarTarea && (
        <ModalAsignarTareaRapida
          equipo={participantesAsignables}
          onCerrar={() => setMostrarAsignarTarea(false)}
          onCreado={() => setMostrarAsignarTarea(false)}
        />
      )}

      {confirmandoFinDeSemana && (
        <ModalFinDeSemana
          fecha={fecha}
          onDejar={() => handleElegirFinDeSemana(fecha)}
          onMover={handleElegirFinDeSemana}
          onCancelar={() => setConfirmandoFinDeSemana(false)}
        />
      )}
    </Modal>
  );
}

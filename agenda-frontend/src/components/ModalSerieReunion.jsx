import { useEffect, useState } from "react";
import { acuerdosApi, entregablesApi, notasApi, pendientesApi, proyectosApi, seriesReunionApi } from "../api/endpoints";
import { etiquetaRol } from "../utils/rolLabels";
import ConfirmDialog from "./ConfirmDialog";
import Modal from "./Modal";

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

const ETIQUETAS_ESTADO = {
  revisado: "revisado",
  pendiente: "pendiente",
  revisado_con_pendientes: "revisado, con pendientes nuevos",
};

const TIPOS_ITEM = [
  { value: "pendiente", label: "Pendiente" },
  { value: "tema", label: "Tema/subtema" },
  { value: "entregable", label: "Entregable" },
  { value: "nota", label: "Nota" },
  { value: "acuerdo", label: "Acuerdo" },
];

const ITEM_VACIO = {
  tipo: "pendiente",
  seccionId: "",
  texto: "",
  detalle: "",
  entregableId: "",
  notaId: "",
  notaContenido: "",
  pendienteId: "",
  pendienteContenido: "",
  acuerdoId: "",
};

/**
 * Alta/edición de una junta recurrente (Fase 2/3, 2026-08-17): día de la
 * semana + hora en vez de una fecha única -- sus ocurrencias se agendan
 * solas (ver app/services/materializar_series.py). Al crearla, el mismo
 * modal se queda abierto y se convierte en el panel de "Agenda de esta
 * junta" -- la lista persistente de temas/pendientes que se revisan en
 * cada ocurrencia, con lo no revisado arrastrándose a la siguiente.
 *
 * Ampliado 2026-08-17 (caso Diana): una junta puede ser general
 * (proyectoId=null) con puntos agrupados por sección (tema/subtema), cada
 * punto editable/reordenable y con un tipo "nota" que jala una Nota real
 * del tema. `proyectoId` puede venir null (junta general).
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

  const [agenda, setAgenda] = useState([]);
  const [cargandoAgenda, setCargandoAgenda] = useState(false);
  const [arbol, setArbol] = useState([]); // {id, nombre, ruta} de todo tema/subtema visible

  const [itemEditandoId, setItemEditandoId] = useState(null); // null = "agregar", id = "editar"
  const [item, setItem] = useState(ITEM_VACIO);
  const [entregablesSeccion, setEntregablesSeccion] = useState([]);
  const [notasSeccion, setNotasSeccion] = useState([]);
  const [pendientesSeccion, setPendientesSeccion] = useState([]);
  const [acuerdosSeccion, setAcuerdosSeccion] = useState([]);
  const [agregandoItem, setAgregandoItem] = useState(false);

  const cargarAgenda = async (id) => {
    setCargandoAgenda(true);
    try {
      const [ag, arbolVisible] = await Promise.all([
        seriesReunionApi.agenda(id),
        proyectosApi.arbolVisible(),
      ]);
      setAgenda(ag);
      setArbol(arbolVisible);
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

  // Cuando el tipo es "entregable" o "nota", cargar las opciones de esa
  // sección bajo demanda (solo cuando ya se eligió a cuál tema/subtema).
  useEffect(() => {
    if (item.tipo === "entregable" && item.seccionId) {
      entregablesApi.listarPorProyecto(Number(item.seccionId)).then(setEntregablesSeccion).catch(() => setEntregablesSeccion([]));
    } else {
      setEntregablesSeccion([]);
    }
    if (item.tipo === "nota" && item.seccionId) {
      notasApi.listar({ proyecto_id: Number(item.seccionId) }).then(setNotasSeccion).catch(() => setNotasSeccion([]));
    } else {
      setNotasSeccion([]);
    }
    if (item.tipo === "pendiente" && item.seccionId) {
      pendientesApi
        .listar({ proyecto_id: Number(item.seccionId) })
        .then(setPendientesSeccion)
        .catch(() => setPendientesSeccion([]));
    } else {
      setPendientesSeccion([]);
    }
    if (item.tipo === "acuerdo" && item.seccionId) {
      acuerdosApi
        .listarPorProyecto(Number(item.seccionId))
        .then(setAcuerdosSeccion)
        .catch(() => setAcuerdosSeccion([]));
    } else {
      setAcuerdosSeccion([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.tipo, item.seccionId]);

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

  const limpiarFormularioItem = () => {
    setItemEditandoId(null);
    setItem(ITEM_VACIO);
  };

  const handleEditarItem = (agendaItem) => {
    setItemEditandoId(agendaItem.id);
    setItem({
      tipo: agendaItem.tipo,
      seccionId: agendaItem.seccion_proyecto_id ? String(agendaItem.seccion_proyecto_id) : "",
      texto: agendaItem.tipo === "pendiente" ? agendaItem.nombre : "",
      detalle: agendaItem.detalle || "",
      entregableId: "",
      notaId: "",
      notaContenido: "",
      pendienteId: "",
      pendienteContenido: "",
      acuerdoId: "",
    });
  };

  const handleGuardarItem = async (e) => {
    e.preventDefault();
    setError("");
    setAgregandoItem(true);
    try {
      if (itemEditandoId) {
        await seriesReunionApi.editarItemAgenda(itemEditandoId, {
          texto: item.tipo === "pendiente" ? item.texto : undefined,
          detalle: item.detalle || null,
          seccion_proyecto_id: item.seccionId ? Number(item.seccionId) : null,
        });
      } else {
        const datos = { tipo: item.tipo, detalle: item.detalle || null };
        if (item.tipo === "tema") {
          datos.proyecto_id = Number(item.seccionId);
          datos.seccion_proyecto_id = Number(item.seccionId);
        } else {
          datos.seccion_proyecto_id = item.seccionId ? Number(item.seccionId) : null;
          if (item.tipo === "pendiente") {
            if (item.pendienteId) datos.pendiente_id = Number(item.pendienteId);
            else datos.pendiente_contenido = item.pendienteContenido;
          }
          if (item.tipo === "entregable") datos.entregable_id = Number(item.entregableId);
          if (item.tipo === "nota") {
            if (item.notaId) datos.nota_id = Number(item.notaId);
            else datos.nota_contenido = item.notaContenido;
          }
          if (item.tipo === "acuerdo") datos.acuerdo_id = Number(item.acuerdoId);
        }
        await seriesReunionApi.agregarItemAgenda(serieActual.id, datos);
      }
      limpiarFormularioItem();
      await cargarAgenda(serieActual.id);
    } catch (err) {
      setError(err.response?.data?.detail || "No se pudo guardar el ítem.");
    } finally {
      setAgregandoItem(false);
    }
  };

  const handleQuitarItem = async (itemId) => {
    setError("");
    try {
      await seriesReunionApi.archivarItemAgenda(itemId);
      if (itemEditandoId === itemId) limpiarFormularioItem();
      await cargarAgenda(serieActual.id);
    } catch {
      setError("No se pudo quitar el ítem.");
    }
  };

  const handleMoverItem = async (itemId, direccion) => {
    setError("");
    try {
      await seriesReunionApi.moverItemAgenda(itemId, direccion);
      await cargarAgenda(serieActual.id);
    } catch {
      setError("No se pudo reordenar el ítem.");
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

  // Agrupar la agenda por sección (seccion_proyecto_id) -- "General" para
  // los ítems sin sección (junta general sin agrupar, o un pendiente suelto).
  const grupos = [];
  const indicePorSeccion = {};
  agenda.forEach((it) => {
    const clave = it.seccion_proyecto_id || "general";
    if (!(clave in indicePorSeccion)) {
      indicePorSeccion[clave] = grupos.length;
      grupos.push({ nombre: it.seccion_nombre || "General", items: [] });
    }
    grupos[indicePorSeccion[clave]].items.push(it);
  });

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

        {serieActual && (
          <div className="stack" style={{ borderTop: "1px solid var(--color-border)", paddingTop: 12 }}>
            <h3 style={{ fontSize: "0.9rem", margin: 0 }}>Agenda de esta junta</h3>
            <p style={{ color: "var(--color-text-muted)", fontSize: "0.78rem", margin: 0 }}>
              Lo que agregues aquí se revisa en cada ocurrencia — lo que no se revise sigue pendiente la
              próxima vez. Los puntos se agrupan por tema.
            </p>

            {cargandoAgenda && <p style={{ fontSize: "0.85rem" }}>Cargando...</p>}
            {!cargandoAgenda && agenda.length === 0 && (
              <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
                Todavía no hay ítems en la agenda.
              </p>
            )}

            {grupos.map((grupo) => (
              <div key={grupo.nombre} className="stack" style={{ gap: 4 }}>
                <h4 style={{ fontSize: "0.82rem", margin: "6px 0 0", color: "var(--color-text-muted)" }}>
                  {grupo.nombre}
                </h4>
                {grupo.items.map((it, idx) => (
                  <div key={it.id} className="list-inline" style={{ padding: "4px 0", alignItems: "flex-start" }}>
                    <div>
                      <span style={{ fontSize: "0.85rem" }}>
                        {it.nombre}{" "}
                        <span style={{ color: "var(--color-text-muted)", fontSize: "0.78rem" }}>
                          — {ETIQUETAS_ESTADO[it.estado_actual] || it.estado_actual}
                        </span>
                      </span>
                      {it.detalle && (
                        <p style={{ margin: "2px 0 0", fontSize: "0.78rem", color: "var(--color-text-muted)" }}>
                          {it.detalle}
                        </p>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button
                        type="button"
                        className="btn btn--ghost"
                        style={{ fontSize: "0.72rem", padding: "2px 6px" }}
                        onClick={() => handleMoverItem(it.id, "arriba")}
                        disabled={idx === 0}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost"
                        style={{ fontSize: "0.72rem", padding: "2px 6px" }}
                        onClick={() => handleMoverItem(it.id, "abajo")}
                        disabled={idx === grupo.items.length - 1}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost"
                        style={{ fontSize: "0.72rem", padding: "2px 6px" }}
                        onClick={() => handleEditarItem(it)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost"
                        style={{ fontSize: "0.72rem", padding: "2px 6px" }}
                        onClick={() => handleQuitarItem(it.id)}
                      >
                        Quitar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))}

            <form className="stack" onSubmit={handleGuardarItem} style={{ gap: 6, marginTop: 8 }}>
              <h4 style={{ fontSize: "0.85rem", margin: 0 }}>
                {itemEditandoId ? "Editar punto" : "Agregar punto a la agenda"}
              </h4>

              {!itemEditandoId && (
                <select
                  className="input"
                  value={item.tipo}
                  onChange={(e) => setItem({ ...ITEM_VACIO, tipo: e.target.value })}
                >
                  {TIPOS_ITEM.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              )}

              <select
                className="input"
                value={item.seccionId}
                onChange={(e) => setItem({ ...item, seccionId: e.target.value })}
                required={item.tipo === "tema"}
              >
                <option value="">
                  {item.tipo === "tema" ? "Selecciona el tema/subtema" : "Sin sección (General)"}
                </option>
                {arbol.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.ruta}
                  </option>
                ))}
              </select>

              {item.tipo === "pendiente" && !itemEditandoId && (
                <>
                  <select
                    className="input"
                    value={item.pendienteId}
                    onChange={(e) => setItem({ ...item, pendienteId: e.target.value, pendienteContenido: "" })}
                    disabled={!item.seccionId}
                  >
                    <option value="">
                      {!item.seccionId
                        ? "Elige primero una sección"
                        : "Escribir un pendiente nuevo (abajo) o elegir uno existente"}
                    </option>
                    {pendientesSeccion.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.contenido.slice(0, 60)}
                      </option>
                    ))}
                  </select>
                  {!item.pendienteId && (
                    <textarea
                      className="input"
                      rows={2}
                      placeholder="O escribe un pendiente nuevo sobre este tema..."
                      value={item.pendienteContenido}
                      onChange={(e) => setItem({ ...item, pendienteContenido: e.target.value })}
                      disabled={!item.seccionId}
                      required={!item.pendienteId}
                    />
                  )}
                </>
              )}

              {item.tipo === "pendiente" && itemEditandoId && (
                <input
                  className="input"
                  placeholder="Describe el pendiente"
                  value={item.texto}
                  onChange={(e) => setItem({ ...item, texto: e.target.value })}
                  required
                />
              )}

              {item.tipo === "entregable" && !itemEditandoId && (
                <select
                  className="input"
                  value={item.entregableId}
                  onChange={(e) => setItem({ ...item, entregableId: e.target.value })}
                  required
                  disabled={!item.seccionId || entregablesSeccion.length === 0}
                >
                  <option value="" disabled>
                    {!item.seccionId
                      ? "Elige primero una sección"
                      : entregablesSeccion.length === 0
                      ? "Esta sección no tiene entregables"
                      : "Selecciona un entregable"}
                  </option>
                  {entregablesSeccion.map((en) => (
                    <option key={en.id} value={en.id}>
                      {en.nombre}
                    </option>
                  ))}
                </select>
              )}

              {item.tipo === "acuerdo" && !itemEditandoId && (
                <select
                  className="input"
                  value={item.acuerdoId}
                  onChange={(e) => setItem({ ...item, acuerdoId: e.target.value })}
                  required
                  disabled={!item.seccionId || acuerdosSeccion.length === 0}
                >
                  <option value="" disabled>
                    {!item.seccionId
                      ? "Elige primero una sección"
                      : acuerdosSeccion.length === 0
                      ? "Esta sección no tiene acuerdos"
                      : "Selecciona un acuerdo"}
                  </option>
                  {acuerdosSeccion.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.descripcion.slice(0, 60)}
                      {a.responsable_nombre ? ` — ${a.responsable_nombre}` : ""}
                    </option>
                  ))}
                </select>
              )}

              {item.tipo === "nota" && !itemEditandoId && (
                <>
                  <select
                    className="input"
                    value={item.notaId}
                    onChange={(e) => setItem({ ...item, notaId: e.target.value, notaContenido: "" })}
                    disabled={!item.seccionId}
                  >
                    <option value="">
                      {!item.seccionId
                        ? "Elige primero una sección"
                        : "Escribir una nota nueva (abajo) o elegir una existente"}
                    </option>
                    {notasSeccion.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.contenido.slice(0, 60)}
                      </option>
                    ))}
                  </select>
                  {!item.notaId && (
                    <textarea
                      className="input"
                      rows={2}
                      placeholder="O escribe una nota nueva sobre este tema..."
                      value={item.notaContenido}
                      onChange={(e) => setItem({ ...item, notaContenido: e.target.value })}
                      disabled={!item.seccionId}
                      required={!item.notaId}
                    />
                  )}
                </>
              )}

              <textarea
                className="input"
                rows={2}
                placeholder="Detalle opcional (pegar correo, montos, un link...)"
                value={item.detalle}
                onChange={(e) => setItem({ ...item, detalle: e.target.value })}
              />

              {error && <p className="error-text">{error}</p>}

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="btn btn--ghost"
                  type="submit"
                  disabled={agregandoItem}
                  style={{ alignSelf: "flex-start" }}
                >
                  {agregandoItem ? "Guardando..." : itemEditandoId ? "Guardar cambios" : "Agregar a la agenda"}
                </button>
                {itemEditandoId && (
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={limpiarFormularioItem}
                    style={{ alignSelf: "flex-start" }}
                  >
                    Cancelar
                  </button>
                )}
              </div>
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

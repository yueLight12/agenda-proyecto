import { useEffect, useState } from "react";
import { entregablesApi, proyectosApi } from "../api/endpoints";
import { esFinDeSemana } from "../utils/finDeSemana";
import { etiquetaRol } from "../utils/rolLabels";
import ConfirmDialog from "./ConfirmDialog";
import HistorialAvance from "./HistorialAvance";
import Modal from "./Modal";
import ModalFinDeSemana from "./ModalFinDeSemana";
import SeccionNotas from "./SeccionNotas";

// Miniatura del comprobante adjunto a un entregable -- mismo patrón blob-url
// que ImagenNota (ver SeccionNotas.jsx): pide el blob autenticado (no se
// puede usar la URL del endpoint directo en <img src>) y libera el object
// URL al desmontar/cambiar de entregable.
function ImagenComprobante({ entregableId }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let cancelado = false;
    let objectUrl = null;
    entregablesApi.comprobanteBlobUrl(entregableId).then((u) => {
      if (cancelado) {
        URL.revokeObjectURL(u);
        return;
      }
      objectUrl = u;
      setUrl(u);
    });
    return () => {
      cancelado = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [entregableId]);

  if (!url) return null;

  return (
    <img
      src={url}
      alt="Comprobante adjunto"
      style={{ maxWidth: 160, maxHeight: 120, borderRadius: 6, marginTop: 6, display: "block" }}
    />
  );
}

// Botones Aprobar/Rechazar de "Visto bueno" (2026-09-03, a petición de
// Yue) -- reusado en la vista de solo supervisión y en el formulario
// completo, ambos lugares donde puede caer quien SÍ puede dar el visto
// bueno (quien creó la tarea, o N1/N2 del tema -- nunca el responsable).
function SeccionVistoBueno({
  procesando,
  error,
  mostrarRechazar,
  setMostrarRechazar,
  notaRechazo,
  setNotaRechazo,
  onAprobar,
  onRechazar,
}) {
  return (
    <div className="stack" style={{ gap: 8, marginTop: 8 }}>
      {!mostrarRechazar ? (
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className="btn btn--primary"
            onClick={onAprobar}
            disabled={procesando}
          >
            {procesando ? "Aprobando..." : "Aprobar"}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setMostrarRechazar(true)}
            disabled={procesando}
          >
            Rechazar
          </button>
        </div>
      ) : (
        <div className="stack" style={{ gap: 4 }}>
          <textarea
            className="input"
            placeholder="¿Qué hay que corregir? (obligatorio)"
            value={notaRechazo}
            onChange={(e) => setNotaRechazo(e.target.value)}
            rows={2}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="btn btn--primary"
              onClick={onRechazar}
              disabled={procesando || !notaRechazo.trim()}
              style={{ background: "var(--color-danger)", borderColor: "var(--color-danger)" }}
            >
              {procesando ? "Rechazando..." : "Confirmar rechazo"}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setMostrarRechazar(false)}
              disabled={procesando}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

export default function FormularioEntregable({
  proyectoId,
  entregable,
  miembros,
  proyectoNombre,
  puedeAsignarAOtros = true,
  // Señal explícita de "administra este tema" (N1/N2/super_admin),
  // independiente de si además es el responsable (2026-08-22, ver
  // VistaSimpleEntregable abajo) -- distinto de `puedeAsignarAOtros`, que
  // en algunos llamadores (CalendarioGlobal.jsx) ya vale true para el
  // propio responsable aunque no administre nada (viene de
  // entregable.puede_editar, que incluye "soy el responsable"). Si no se
  // pasa, se usa `puedeAsignarAOtros` tal cual, para no cambiar el
  // comportamiento de los llamadores que todavía no la pasan.
  puedeAdministrarProyecto = null,
  usuarioActualId,
  onGuardado,
  onCerrar,
}) {
  const esEdicion = Boolean(entregable);
  const esAdministrador = puedeAdministrarProyecto ?? puedeAsignarAOtros;
  // Vista simple de solo lectura + comentarios + "Marcar concluida"
  // (2026-08-22, a petición de Yue): quien abre SU PROPIA tarea sin ser
  // quien administra el tema ve esto en vez del formulario completo de
  // edición -- quien administra (o quien no es el responsable) sigue
  // viendo el formulario de siempre.
  const esVistaSimpleResponsable =
    esEdicion && entregable.responsable_id === usuarioActualId && !esAdministrador;
  // Vista de SOLO SUPERVISIÓN (2026-08-23, a petición de Yue): un líder
  // (N1/N2) que ve esta tarea solo por administrar el TEMA -- sin haberla
  // creado él mismo ni ser el responsable -- no debería ver el formulario
  // completo de edición (eso es exclusivo de quien la creó,
  // entregable.puede_editar, ver permissions.puede_editar_entregable) ni
  // el botón de "Concluir" (eso es del responsable). Reutiliza casi igual
  // la vista simple del responsable -- misma info de solo lectura +
  // comentarios -- pero SIN el botón de concluir, solo el estado actual.
  const esVistaSoloSupervision =
    esEdicion &&
    entregable.responsable_id !== usuarioActualId &&
    !entregable.puede_editar;
  const [nombre, setNombre] = useState(entregable?.nombre || "");
  const [descripcion, setDescripcion] = useState(entregable?.descripcion || "");
  const [responsableId, setResponsableId] = useState(
    entregable?.responsable_id || (puedeAsignarAOtros ? "" : usuarioActualId)
  );
  const [fechaEntrega, setFechaEntrega] = useState(entregable?.fecha_entrega || "");
  // Hora opcional (2026-09-01, a petición de Yue) -- el backend manda
  // "HH:MM:SS", el input type="time" solo acepta "HH:MM".
  const [horaEntrega, setHoraEntrega] = useState(
    entregable?.hora_entrega ? entregable.hora_entrega.slice(0, 5) : ""
  );
  const [sensible, setSensible] = useState(entregable?.sensible || false);
  const [urgenteManual, setUrgenteManual] = useState(entregable?.urgente_manual || false);
  // Comprobante (2026-08-21, a petición de Yue): si se activa, el
  // responsable debe subir una imagen antes de poder marcar 100% de
  // avance -- el bloqueo real vive en el backend (PATCH .../avance), aquí
  // solo se ofrece subir/ver la imagen.
  const [requiereComprobante, setRequiereComprobante] = useState(
    entregable?.requiere_comprobante || false
  );
  const [comprobanteArchivo, setComprobanteArchivo] = useState(null);
  const [subiendoComprobante, setSubiendoComprobante] = useState(false);
  const [errorComprobante, setErrorComprobante] = useState("");
  const [tieneComprobante, setTieneComprobante] = useState(entregable?.tiene_comprobante || false);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [historialAbierto, setHistorialAbierto] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(false);
  // Reasignar (2026-08-20, a petición del cliente: "si te asignaron algo
  // que no te pertenece, poder reasignarlo") -- separado del campo
  // Responsable normal (que solo se muestra si puedeAsignarAOtros) porque
  // el propio responsable actual también puede reasignar sin ser N1/N2,
  // ver Entregable.puede_reasignar (backend).
  const [reasignandoA, setReasignandoA] = useState("");
  const [notaReasignar, setNotaReasignar] = useState("");
  const [reasignando, setReasignando] = useState(false);
  const [errorReasignar, setErrorReasignar] = useState("");
  const muestraReasignar = esEdicion && !puedeAsignarAOtros && entregable?.puede_reasignar;
  // Líderes (N1/N2) de la organización -- para poder reasignar a "otro
  // líder de otra área" sin depender de que ya participe en este tema
  // (2026-08-20, a petición de Yue: caso Bernardo->David->otro N2, o
  // David regresándoselo a Bernardo). Carga perezosa: solo si el select
  // de reasignar de hecho se va a mostrar.
  const [lideres, setLideres] = useState([]);
  useEffect(() => {
    if (!muestraReasignar) return;
    proyectosApi.lideres().then(setLideres).catch(() => {});
  }, [muestraReasignar]);

  const handleReasignar = async () => {
    if (!reasignandoA) return;
    setErrorReasignar("");
    setReasignando(true);
    try {
      await entregablesApi.reasignar(entregable.id, Number(reasignandoA), notaReasignar || null);
      onGuardado();
    } catch (err) {
      setErrorReasignar(err.response?.data?.detail || "No se pudo reasignar el entregable.");
      setReasignando(false);
    }
  };

  const handleSubirComprobante = async () => {
    if (!comprobanteArchivo || !entregable) return;
    setErrorComprobante("");
    setSubiendoComprobante(true);
    try {
      await entregablesApi.subirComprobante(entregable.id, comprobanteArchivo);
      setComprobanteArchivo(null);
      setTieneComprobante(true);
    } catch (err) {
      setErrorComprobante(
        err.response?.data?.detail || "No se pudo subir el comprobante."
      );
    } finally {
      setSubiendoComprobante(false);
    }
  };

  const [marcandoConcluida, setMarcandoConcluida] = useState(false);
  const handleMarcarConcluida = async () => {
    setError("");
    setMarcandoConcluida(true);
    try {
      await entregablesApi.actualizarAvance(entregable.id, 100);
      onGuardado();
    } catch (err) {
      setError(err.response?.data?.detail || "No se pudo marcar como concluida.");
      setMarcandoConcluida(false);
    }
  };

  // "Visto bueno" (2026-09-03, a petición de Yue) -- aprobar/rechazar un
  // entregable marcado al 100% (estatus "pendiente_aprobacion"). Rechazar
  // exige una nota con el motivo, el responsable necesita saber qué
  // corregir.
  const [procesandoVisto, setProcesandoVisto] = useState(false);
  const [mostrarRechazar, setMostrarRechazar] = useState(false);
  const [notaRechazo, setNotaRechazo] = useState("");
  const [errorVisto, setErrorVisto] = useState("");

  const handleAprobar = async () => {
    setErrorVisto("");
    setProcesandoVisto(true);
    try {
      await entregablesApi.aprobar(entregable.id);
      onGuardado();
    } catch (err) {
      setErrorVisto(err.response?.data?.detail || "No se pudo aprobar la tarea.");
      setProcesandoVisto(false);
    }
  };

  const handleRechazar = async () => {
    if (!notaRechazo.trim()) return;
    setErrorVisto("");
    setProcesandoVisto(true);
    try {
      await entregablesApi.rechazar(entregable.id, notaRechazo.trim());
      onGuardado();
    } catch (err) {
      setErrorVisto(err.response?.data?.detail || "No se pudo rechazar la tarea.");
      setProcesandoVisto(false);
    }
  };

  const handleEliminar = async () => {
    setConfirmandoEliminar(false);
    setEliminando(true);
    try {
      await entregablesApi.eliminar(entregable.id);
      onGuardado();
    } catch (err) {
      setError(err.response?.data?.detail || "No se pudo eliminar el entregable.");
      setEliminando(false);
    }
  };

  // Aviso de fin de semana (2026-09-02, a petición de Yue) -- se dispara al
  // enviar el formulario, antes de guardar nada; `guardar` es la lógica real
  // y se llama de nuevo con la fecha ya decidida (tal cual o movida) una vez
  // resuelto el aviso.
  const [confirmandoFinDeSemana, setConfirmandoFinDeSemana] = useState(false);

  const guardar = async (fechaFinal) => {
    setError("");
    setGuardando(true);
    const datos = {
      nombre,
      descripcion: descripcion || null,
      responsable_id: Number(responsableId),
      fecha_entrega: fechaFinal,
      hora_entrega: horaEntrega || null,
      sensible,
      urgente_manual: urgenteManual,
      requiere_comprobante: requiereComprobante,
    };
    try {
      if (esEdicion) {
        await entregablesApi.actualizar(entregable.id, datos);
      } else {
        await entregablesApi.crear(proyectoId, datos);
      }
      onGuardado();
    } catch (err) {
      setError(
        err.response?.data?.detail || "No se pudo guardar el entregable."
      );
    } finally {
      setGuardando(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (esFinDeSemana(fechaEntrega)) {
      setConfirmandoFinDeSemana(true);
      return;
    }
    await guardar(fechaEntrega);
  };

  const handleElegirFinDeSemana = async (fechaFinal) => {
    setConfirmandoFinDeSemana(false);
    if (fechaFinal !== fechaEntrega) setFechaEntrega(fechaFinal);
    await guardar(fechaFinal);
  };

  // "Asignado por" (2026-08-21, a petición de Yue): solo lectura, busca al
  // creador dentro del equipo ya cargado -- si no está (ej. ya no
  // pertenece al equipo visible), simplemente no se muestra.
  const creador = esEdicion
    ? miembros.find((m) => m.usuario_id === entregable.creado_por)
    : null;

  if (esVistaSimpleResponsable) {
    const yaConcluida = entregable.estatus === "cumplido";
    const enEsperaDeVisto = entregable.estatus === "pendiente_aprobacion";
    return (
      <Modal titulo={entregable.nombre} onCerrar={onCerrar}>
        <div className="stack" style={{ gap: 12 }}>
          {proyectoNombre && (
            <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem", margin: 0 }}>
              Proyecto: {proyectoNombre}
            </p>
          )}

          {entregable.descripcion && <p style={{ margin: 0 }}>{entregable.descripcion}</p>}

          <div className="stack" style={{ gap: 4 }}>
            {creador && (
              <p style={{ margin: 0, fontSize: "0.85rem" }}>
                <strong>Asignado por:</strong> {creador.nombre}
              </p>
            )}
            <p style={{ margin: 0, fontSize: "0.85rem" }}>
              <strong>Fecha límite:</strong>{" "}
              {new Date(`${entregable.fecha_entrega}T00:00:00`).toLocaleDateString("es-MX", {
                dateStyle: "long",
              })}
              {entregable.hora_entrega && ` a las ${entregable.hora_entrega.slice(0, 5)}`}
            </p>
            <p style={{ margin: 0, fontSize: "0.85rem" }}>
              <strong>Urgente:</strong> {entregable.urgente ? "Sí" : "No"}
            </p>
            {/* "Requiere comprobante" oculto por ahora (2026-09-17, a
                petición de Yue) -- no se borra, ver el mismo comentario más
                abajo junto al checkbox. */}
            {false && (
              <p style={{ margin: 0, fontSize: "0.85rem" }}>
                <strong>Requiere comprobante:</strong> {requiereComprobante ? "Sí" : "No"}
              </p>
            )}
          </div>

          {false && requiereComprobante && (
            <div className="stack" style={{ gap: 4 }}>
              <label style={{ fontSize: "0.78rem", color: "var(--color-text-muted)" }}>
                Comprobante (imagen) -- necesario para poder marcar como concluida
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => setComprobanteArchivo(e.target.files?.[0] || null)}
                  style={{ display: "block", marginTop: 4, fontSize: "0.78rem" }}
                />
              </label>
              <button
                type="button"
                className="btn btn--ghost"
                disabled={!comprobanteArchivo || subiendoComprobante}
                onClick={handleSubirComprobante}
                style={{ alignSelf: "flex-start" }}
              >
                {subiendoComprobante ? "Subiendo..." : "Subir comprobante"}
              </button>
              {errorComprobante && <p className="error-text">{errorComprobante}</p>}
              {tieneComprobante && <ImagenComprobante entregableId={entregable.id} />}
            </div>
          )}

          {error && <p className="error-text">{error}</p>}

          {yaConcluida ? (
            <p style={{ margin: 0, color: "var(--color-success)", fontWeight: 600 }}>
              ✓ Ya está marcada como concluida.
            </p>
          ) : enEsperaDeVisto ? (
            <p style={{ margin: 0, color: "var(--color-text-muted)", fontWeight: 600 }}>
              ⏳ Marcada al 100% -- en espera de que te den el visto bueno.
            </p>
          ) : (
            <button
              type="button"
              className="btn btn--primary"
              onClick={handleMarcarConcluida}
              disabled={marcandoConcluida}
              style={{ alignSelf: "flex-start" }}
            >
              {marcandoConcluida ? "Concluyendo..." : "Concluir"}
            </button>
          )}
        </div>

        <div style={{ marginTop: 16, borderTop: "1px solid var(--color-border)", paddingTop: 16 }}>
          <SeccionNotas
            entregableId={entregable.id}
            puedeAdministrar={false}
            tituloPersonalizado="¿Tienes dudas? Déjalas aquí"
            textoBoton="Enviar mensaje"
            placeholderTexto="Escribe tu duda..."
          />
        </div>
      </Modal>
    );
  }

  if (esVistaSoloSupervision) {
    const yaConcluida = entregable.estatus === "cumplido";
    const enEsperaDeVisto = entregable.estatus === "pendiente_aprobacion";
    const responsable = miembros.find((m) => m.usuario_id === entregable.responsable_id);
    return (
      <Modal titulo={entregable.nombre} onCerrar={onCerrar}>
        <div className="stack" style={{ gap: 12 }}>
          {proyectoNombre && (
            <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem", margin: 0 }}>
              Proyecto: {proyectoNombre}
            </p>
          )}

          {entregable.descripcion && <p style={{ margin: 0 }}>{entregable.descripcion}</p>}

          <div className="stack" style={{ gap: 4 }}>
            {responsable && (
              <p style={{ margin: 0, fontSize: "0.85rem" }}>
                <strong>Responsable:</strong> {responsable.nombre}
              </p>
            )}
            {creador && (
              <p style={{ margin: 0, fontSize: "0.85rem" }}>
                <strong>Asignado por:</strong> {creador.nombre}
              </p>
            )}
            <p style={{ margin: 0, fontSize: "0.85rem" }}>
              <strong>Fecha límite:</strong>{" "}
              {new Date(`${entregable.fecha_entrega}T00:00:00`).toLocaleDateString("es-MX", {
                dateStyle: "long",
              })}
              {entregable.hora_entrega && ` a las ${entregable.hora_entrega.slice(0, 5)}`}
            </p>
            <p style={{ margin: 0, fontSize: "0.85rem" }}>
              <strong>Urgente:</strong> {entregable.urgente ? "Sí" : "No"}
            </p>
            {entregable.notificacion_vista != null && (
              <p style={{ margin: 0, fontSize: "0.85rem" }}>
                {entregable.notificacion_vista ? (
                  <>
                    ✓ {responsable?.nombre || "El responsable"} ya vio esta tarea
                    {entregable.notificacion_vista_fecha &&
                      ` (${new Date(entregable.notificacion_vista_fecha).toLocaleString("es-MX", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })})`}
                  </>
                ) : (
                  <span style={{ color: "var(--color-text-muted)" }}>
                    ○ Todavía no la ha visto
                  </span>
                )}
              </p>
            )}
          </div>

          {/* Solo supervisa -- no es el responsable ni quien la creó, así
              que no ve el botón "Concluir" (eso lo decide el responsable)
              ni campos editables (eso es solo de quien la creó). */}
          <p
            style={{
              margin: 0,
              fontWeight: 600,
              color: yaConcluida
                ? "var(--color-success)"
                : enEsperaDeVisto
                ? "var(--color-warning, #b45309)"
                : "var(--color-text-muted)",
            }}
          >
            {yaConcluida
              ? "✓ Ya está marcada como concluida."
              : enEsperaDeVisto
              ? "⏳ Marcada al 100% -- en espera de visto bueno."
              : "Estatus: pendiente de concluir."}
          </p>

          {enEsperaDeVisto && entregable.puede_aprobar && (
            <SeccionVistoBueno
              procesando={procesandoVisto}
              error={errorVisto}
              mostrarRechazar={mostrarRechazar}
              setMostrarRechazar={setMostrarRechazar}
              notaRechazo={notaRechazo}
              setNotaRechazo={setNotaRechazo}
              onAprobar={handleAprobar}
              onRechazar={handleRechazar}
            />
          )}
        </div>

        <div style={{ marginTop: 16, borderTop: "1px solid var(--color-border)", paddingTop: 16 }}>
          <SeccionNotas
            entregableId={entregable.id}
            puedeAdministrar={false}
            tituloPersonalizado="Comentarios / dudas"
            textoBoton="Enviar mensaje"
            placeholderTexto="Escribe un comentario..."
          />
        </div>
      </Modal>
    );
  }

  return (
    <Modal titulo={esEdicion ? "Editar entregable" : "Nuevo entregable"} onCerrar={onCerrar}>
      {esEdicion && proyectoNombre && (
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem", marginTop: 0 }}>
          Proyecto: {proyectoNombre}
        </p>
      )}
      {esEdicion && creador && (
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem", marginTop: 0 }}>
          Asignado por: {creador.nombre}
        </p>
      )}

      {esEdicion && entregable.estatus === "pendiente_aprobacion" && (
        <div
          className="stack"
          style={{
            gap: 4,
            marginBottom: 12,
            padding: 10,
            borderRadius: 8,
            background: "var(--color-warning-bg, rgba(180, 83, 9, 0.1))",
          }}
        >
          <p style={{ margin: 0, fontWeight: 600, color: "var(--color-warning, #b45309)" }}>
            ⏳ Marcada al 100% -- en espera de visto bueno.
          </p>
          {entregable.puede_aprobar && (
            <SeccionVistoBueno
              procesando={procesandoVisto}
              error={errorVisto}
              mostrarRechazar={mostrarRechazar}
              setMostrarRechazar={setMostrarRechazar}
              notaRechazo={notaRechazo}
              setNotaRechazo={setNotaRechazo}
              onAprobar={handleAprobar}
              onRechazar={handleRechazar}
            />
          )}
        </div>
      )}

      <form id="form-entregable" className="stack" onSubmit={handleSubmit}>
        <label className="stack" style={{ gap: 4 }}>
          <span style={{ fontSize: "0.85rem" }}>Nombre</span>
          <input
            className="input"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
          />
        </label>

        <label className="stack" style={{ gap: 4 }}>
          <span style={{ fontSize: "0.85rem" }}>Descripción</span>
          <input
            className="input"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
          />
        </label>

        <label className="stack" style={{ gap: 4 }}>
          <span style={{ fontSize: "0.85rem" }}>Responsable</span>
          {puedeAsignarAOtros ? (
            <select
              className="input"
              value={responsableId}
              onChange={(e) => setResponsableId(e.target.value)}
              required
            >
              <option value="" disabled>
                Selecciona un responsable
              </option>
              {miembros.map((m) => (
                <option key={m.usuario_id} value={m.usuario_id}>
                  {m.nombre} ({etiquetaRol(m.rol)})
                </option>
              ))}
            </select>
          ) : (
            <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem", margin: 0 }}>
              Tú mismo — se notificará a tu supervisor.
            </p>
          )}
        </label>

        {esEdicion && entregable.notificacion_vista != null && (
          <p style={{ margin: 0, fontSize: "0.85rem" }}>
            {entregable.notificacion_vista ? (
              <>
                ✓ {entregable.responsable_nombre || "El responsable"} ya vio esta tarea
                {entregable.notificacion_vista_fecha &&
                  ` (${new Date(entregable.notificacion_vista_fecha).toLocaleString("es-MX", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })})`}
              </>
            ) : (
              <span style={{ color: "var(--color-text-muted)" }}>○ Todavía no la ha visto</span>
            )}
          </p>
        )}

        {muestraReasignar && (
          <label className="stack" style={{ gap: 4 }}>
            <span style={{ fontSize: "0.85rem" }}>
              ¿No te corresponde? Reasignar a otra persona
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <select
                className="input"
                value={reasignandoA}
                onChange={(e) => setReasignandoA(e.target.value)}
                style={{ flex: 1 }}
              >
                <option value="">Selecciona una persona...</option>
                <optgroup label="Este proyecto">
                  {miembros
                    .filter((m) => m.usuario_id !== entregable.responsable_id)
                    .map((m) => (
                      <option key={m.usuario_id} value={m.usuario_id}>
                        {m.nombre} ({etiquetaRol(m.rol)})
                      </option>
                    ))}
                </optgroup>
                {lideres.filter(
                  (l) =>
                    l.usuario_id !== entregable.responsable_id &&
                    !miembros.some((m) => m.usuario_id === l.usuario_id)
                ).length > 0 && (
                  <optgroup label="Otros líderes">
                    {lideres
                      .filter(
                        (l) =>
                          l.usuario_id !== entregable.responsable_id &&
                          !miembros.some((m) => m.usuario_id === l.usuario_id)
                      )
                      .map((l) => (
                        <option key={l.usuario_id} value={l.usuario_id}>
                          {l.nombre}
                          {l.puesto ? ` — ${l.puesto}` : ""}
                        </option>
                      ))}
                  </optgroup>
                )}
              </select>
              <button
                type="button"
                className="btn btn--ghost"
                disabled={!reasignandoA || reasignando}
                onClick={handleReasignar}
              >
                {reasignando ? "Reasignando..." : "Reasignar"}
              </button>
            </div>
            <textarea
              className="input"
              placeholder="Nota (opcional) -- ej. 'esto no me compete, es de otra área'"
              value={notaReasignar}
              onChange={(e) => setNotaReasignar(e.target.value)}
              rows={2}
            />
            {errorReasignar && <p className="error-text">{errorReasignar}</p>}
          </label>
        )}

        <label className="stack" style={{ gap: 4 }}>
          <span style={{ fontSize: "0.85rem" }}>Fecha de entrega</span>
          <input
            className="input"
            type="date"
            value={fechaEntrega}
            onChange={(e) => setFechaEntrega(e.target.value)}
            required
          />
        </label>

        <label className="stack" style={{ gap: 4 }}>
          <span style={{ fontSize: "0.85rem" }}>Hora (opcional)</span>
          <input
            className="input"
            type="time"
            value={horaEntrega}
            onChange={(e) => setHoraEntrega(e.target.value)}
          />
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={sensible}
            onChange={(e) => setSensible(e.target.checked)}
          />
          <span style={{ fontSize: "0.85rem" }}>Entregable sensible</span>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={urgenteManual}
            onChange={(e) => setUrgenteManual(e.target.checked)}
          />
          <span style={{ fontSize: "0.85rem" }}>
            Marcar como urgente{" "}
            <span style={{ color: "var(--color-text-muted)" }}>
              (además, se marca urgente solo si ya venció o vence en 3 días o menos)
            </span>
          </span>
        </label>

        {/* "Requiere comprobante" y su subida de imagen ocultos por ahora
            (2026-09-17, a petición de Yue: falló al asignar una tarea con
            esto activado) -- no se borra, solo se deja de mostrar.
            requiereComprobante se queda en su valor por default (false) y
            así se manda al backend. Para reactivarlo, quitar el
            `false &&` de los dos bloques de abajo. */}
        {false && (
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={requiereComprobante}
              onChange={(e) => setRequiereComprobante(e.target.checked)}
            />
            <span style={{ fontSize: "0.85rem" }}>Requiere comprobante</span>
          </label>
        )}

        {false && esEdicion && requiereComprobante && (
          <div className="stack" style={{ gap: 4 }}>
            <label style={{ fontSize: "0.78rem", color: "var(--color-text-muted)" }}>
              Comprobante (imagen)
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => setComprobanteArchivo(e.target.files?.[0] || null)}
                style={{ display: "block", marginTop: 4, fontSize: "0.78rem" }}
              />
            </label>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={!comprobanteArchivo || subiendoComprobante}
              onClick={handleSubirComprobante}
              style={{ alignSelf: "flex-start" }}
            >
              {subiendoComprobante ? "Subiendo..." : "Subir comprobante"}
            </button>
            {errorComprobante && <p className="error-text">{errorComprobante}</p>}
            {tieneComprobante && <ImagenComprobante entregableId={entregable.id} />}
          </div>
        )}

        {error && <p className="error-text">{error}</p>}
      </form>

      {confirmandoEliminar && (
        <ConfirmDialog
          titulo="Eliminar entregable"
          mensaje={`¿Eliminar "${nombre}"? Esta acción no se puede deshacer.`}
          onConfirmar={handleEliminar}
          onCancelar={() => setConfirmandoEliminar(false)}
        />
      )}

      {confirmandoFinDeSemana && (
        <ModalFinDeSemana
          fecha={fechaEntrega}
          onDejar={() => handleElegirFinDeSemana(fechaEntrega)}
          onMover={handleElegirFinDeSemana}
          onCancelar={() => setConfirmandoFinDeSemana(false)}
        />
      )}

      {esEdicion && (
        <div style={{ marginTop: 16, borderTop: "1px solid var(--color-border)", paddingTop: 16 }}>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setHistorialAbierto((v) => !v)}
            aria-expanded={historialAbierto}
          >
            {historialAbierto ? "Ocultar histórico de avance ▲" : "Ver histórico de avance ▼"}
          </button>
          {historialAbierto && (
            <div style={{ marginTop: 12 }}>
              <HistorialAvance entregableId={entregable.id} miembros={miembros} />
            </div>
          )}
        </div>
      )}

      {esEdicion && (
        <div style={{ marginTop: 16, borderTop: "1px solid var(--color-border)", paddingTop: 16 }}>
          <SeccionNotas
            entregableId={entregable.id}
            puedeAdministrar={puedeAsignarAOtros}
            tituloPersonalizado="¿Tienes dudas? Déjalas aquí"
            textoBoton="Enviar mensaje"
            placeholderTexto="Escribe tu duda..."
          />
        </div>
      )}

      {/* Eliminar/Guardar cambios movidos al final de TODO el modal
          (2026-08-23, a petición de Yue) -- antes quedaban justo después
          de los campos del formulario, "en medio" de la pantalla con el
          histórico y los comentarios debajo. `form="form-entregable"`
          conecta el botón submit al <form> de más arriba aunque ya no
          esté anidado dentro de él. */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 16 }}>
        {esEdicion && puedeAsignarAOtros ? (
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
        <button
          className="btn btn--primary"
          type="submit"
          form="form-entregable"
          disabled={guardando}
        >
          {guardando ? "Guardando..." : esEdicion ? "Guardar cambios" : "Crear entregable"}
        </button>
      </div>
    </Modal>
  );
}

import { useEffect, useState } from "react";
import { entregablesApi, proyectosApi } from "../api/endpoints";
import { etiquetaRol } from "../utils/rolLabels";
import ConfirmDialog from "./ConfirmDialog";
import HistorialAvance from "./HistorialAvance";
import Modal from "./Modal";
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

export default function FormularioEntregable({
  proyectoId,
  entregable,
  miembros,
  proyectoNombre,
  puedeAsignarAOtros = true,
  usuarioActualId,
  onGuardado,
  onCerrar,
}) {
  const esEdicion = Boolean(entregable);
  const [nombre, setNombre] = useState(entregable?.nombre || "");
  const [descripcion, setDescripcion] = useState(entregable?.descripcion || "");
  const [responsableId, setResponsableId] = useState(
    entregable?.responsable_id || (puedeAsignarAOtros ? "" : usuarioActualId)
  );
  const [fechaEntrega, setFechaEntrega] = useState(entregable?.fecha_entrega || "");
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setGuardando(true);
    const datos = {
      nombre,
      descripcion: descripcion || null,
      responsable_id: Number(responsableId),
      fecha_entrega: fechaEntrega,
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

  // "Asignado por" (2026-08-21, a petición de Yue): solo lectura, busca al
  // creador dentro del equipo ya cargado -- si no está (ej. ya no
  // pertenece al equipo visible), simplemente no se muestra.
  const creador = esEdicion
    ? miembros.find((m) => m.usuario_id === entregable.creado_por)
    : null;

  return (
    <Modal titulo={esEdicion ? "Editar entregable" : "Nuevo entregable"} onCerrar={onCerrar}>
      {esEdicion && proyectoNombre && (
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem", marginTop: 0 }}>
          Tema: {proyectoNombre}
        </p>
      )}
      {esEdicion && creador && (
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem", marginTop: 0 }}>
          Asignado por: {creador.nombre}
        </p>
      )}
      <form className="stack" onSubmit={handleSubmit}>
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
                <optgroup label="Este tema">
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

        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={requiereComprobante}
            onChange={(e) => setRequiereComprobante(e.target.checked)}
          />
          <span style={{ fontSize: "0.85rem" }}>
            Requiere comprobante (una imagen) para poder marcarse como completado
          </span>
        </label>

        {esEdicion && requiereComprobante && (
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

        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
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
          <button className="btn btn--primary" type="submit" disabled={guardando}>
            {guardando ? "Guardando..." : esEdicion ? "Guardar cambios" : "Crear entregable"}
          </button>
        </div>
      </form>

      {confirmandoEliminar && (
        <ConfirmDialog
          titulo="Eliminar entregable"
          mensaje={`¿Eliminar "${nombre}"? Esta acción no se puede deshacer.`}
          onConfirmar={handleEliminar}
          onCancelar={() => setConfirmandoEliminar(false)}
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
            tituloPersonalizado="¿Tienes dudas? Escríbelas aquí"
          />
        </div>
      )}
    </Modal>
  );
}

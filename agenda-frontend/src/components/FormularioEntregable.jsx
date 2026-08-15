import { useState } from "react";
import { entregablesApi } from "../api/endpoints";
import { etiquetaRol } from "../utils/rolLabels";
import ConfirmDialog from "./ConfirmDialog";
import HistorialAvance from "./HistorialAvance";
import Modal from "./Modal";
import SeccionNotas from "./SeccionNotas";

export default function FormularioEntregable({
  proyectoId,
  entregable,
  miembros,
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
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [historialAbierto, setHistorialAbierto] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(false);

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

  return (
    <Modal titulo={esEdicion ? "Editar entregable" : "Nuevo entregable"} onCerrar={onCerrar}>
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
          <SeccionNotas entregableId={entregable.id} puedeAdministrar={puedeAsignarAOtros} />
        </div>
      )}
    </Modal>
  );
}

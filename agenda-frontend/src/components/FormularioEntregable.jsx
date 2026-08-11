import { useState } from "react";
import { entregablesApi } from "../api/endpoints";
import Modal from "./Modal";

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
                  {m.nombre} ({m.rol})
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

        <button className="btn btn--primary" type="submit" disabled={guardando}>
          {guardando ? "Guardando..." : esEdicion ? "Guardar cambios" : "Crear entregable"}
        </button>
      </form>
    </Modal>
  );
}

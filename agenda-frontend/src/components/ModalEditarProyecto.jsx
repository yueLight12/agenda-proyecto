import { useState } from "react";
import { proyectosApi } from "../api/endpoints";
import Modal from "./Modal";

export default function ModalEditarProyecto({ proyecto, onGuardado, onCerrar }) {
  const [nombre, setNombre] = useState(proyecto.nombre);
  const [descripcion, setDescripcion] = useState(proyecto.descripcion || "");
  const [activo, setActivo] = useState(proyecto.activo);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const handleGuardar = async (e) => {
    e.preventDefault();
    setError("");
    setGuardando(true);
    try {
      await proyectosApi.actualizar(proyecto.id, {
        nombre,
        descripcion: descripcion || null,
        activo,
      });
      await onGuardado();
    } catch (err) {
      setError(err.response?.data?.detail || "No se pudo guardar el proyecto.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal titulo="Editar proyecto" onCerrar={onCerrar}>
      <form className="stack" onSubmit={handleGuardar}>
        <label className="stack" style={{ gap: 4 }}>
          <span style={{ fontSize: "0.85rem" }}>Nombre del proyecto</span>
          <input
            className="input"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
          />
        </label>
        <label className="stack" style={{ gap: 4 }}>
          <span style={{ fontSize: "0.85rem" }}>Descripción (opcional)</span>
          <input
            className="input"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
          />
        </label>
        <label className="list-inline" style={{ borderBottom: "none", paddingBottom: 0 }}>
          <span style={{ fontSize: "0.85rem" }}>Proyecto activo</span>
          <input
            type="checkbox"
            checked={activo}
            onChange={(e) => setActivo(e.target.checked)}
          />
        </label>
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn--primary" type="submit" disabled={guardando}>
          {guardando ? "Guardando..." : "Guardar cambios"}
        </button>
      </form>
    </Modal>
  );
}

import { useState } from "react";
import { proyectosApi } from "../api/endpoints";
import Modal from "./Modal";

// `proyecto` es opcional: si no viene, el modal entra en modo creación
// (mismo patrón de modal que el resto del sistema — antes "Crear proyecto"
// era el único "crear" que usaba un acordeón inline en vez de un modal).
// `parentId` (solo aplica en modo creación) crea un SUBTEMA dentro de ese
// nodo en vez de un proyecto/tema raíz (ver Fase 1 de jerarquía, 2026-08-16).
// `onCreado(nuevoTema)` es opcional y solo se llama al CREAR (no al editar)
// -- permite que quien use este modal encadene un paso de "agrega a tu
// equipo ahora, o hazlo después" justo después de crear (ver Proyectos.jsx
// y TableroProyecto.jsx, pedido explícito de Yue el 2026-08-17).
export default function ModalEditarProyecto({ proyecto = null, parentId = null, onCreado, onGuardado, onCerrar }) {
  const esEdicion = Boolean(proyecto);
  const [nombre, setNombre] = useState(proyecto?.nombre || "");
  const [descripcion, setDescripcion] = useState(proyecto?.descripcion || "");
  const [activo, setActivo] = useState(proyecto?.activo ?? true);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const handleGuardar = async (e) => {
    e.preventDefault();
    setError("");
    setGuardando(true);
    try {
      if (esEdicion) {
        await proyectosApi.actualizar(proyecto.id, {
          nombre,
          descripcion: descripcion || null,
          activo,
        });
        await onGuardado();
      } else {
        const nuevo = await proyectosApi.crear({ nombre, descripcion: descripcion || null, parent_id: parentId });
        if (onCreado) {
          await onCreado(nuevo);
        } else {
          await onGuardado();
        }
      }
    } catch (err) {
      setError(err.response?.data?.detail || "No se pudo guardar el tema.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      titulo={esEdicion ? "Editar tema" : parentId ? "Nuevo subtema" : "Crear tema"}
      onCerrar={onCerrar}
    >
      <form className="stack" onSubmit={handleGuardar}>
        <label className="stack" style={{ gap: 4 }}>
          <span style={{ fontSize: "0.85rem" }}>Nombre del tema</span>
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
        {esEdicion && (
          <label className="list-inline" style={{ borderBottom: "none", paddingBottom: 0 }}>
            <span style={{ fontSize: "0.85rem" }}>Tema activo</span>
            <input
              type="checkbox"
              checked={activo}
              onChange={(e) => setActivo(e.target.checked)}
            />
          </label>
        )}
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn--primary" type="submit" disabled={guardando}>
          {guardando ? "Guardando..." : esEdicion ? "Guardar cambios" : "Crear"}
        </button>
        {!esEdicion && (
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.8rem" }}>
            {parentId
              ? "Quedarás como administrador de este subtema y podrás agregar a otras personas desde \"Administrar equipo\"."
              : "Quedarás como Dirección de este tema y podrás agregar al resto del equipo desde \"Administrar equipo\"."}
          </p>
        )}
      </form>
    </Modal>
  );
}

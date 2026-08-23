import { useEffect, useState } from "react";
import { miEquipoApi, proyectosApi } from "../api/endpoints";
import Modal from "./Modal";

// `proyecto` es opcional: si no viene, el modal entra en modo creación
// (mismo patrón de modal que el resto del sistema — antes "Crear proyecto"
// era el único "crear" que usaba un acordeón inline en vez de un modal).
// `parentId` (solo aplica en modo creación) crea un SUBTEMA dentro de ese
// nodo en vez de un proyecto/tema raíz (ver Fase 1 de jerarquía, 2026-08-16).
//
// En modo creación (2026-08-22, simplificado a petición de Yue mientras
// hace pruebas): solo nombre, descripción y UNA "persona a cargo" opcional
// (tomada de tu plantilla personal "Mi equipo"), en vez del bloque anterior
// de agregar varias personas con rol/supervisor cada una -- eso sigue
// disponible después desde "Administrar equipo" en el tema ya creado. Si se
// elige a alguien, queda como N2 (líder) del tema nuevo; si se deja en
// blanco, el backend ya deja como encargado a quien crea el tema (ver
// rol_default_para_nuevo_proyecto/crear_proyecto en el backend) -- no hace
// falta ninguna llamada extra para ese caso.
export default function ModalEditarProyecto({ proyecto = null, parentId = null, onGuardado, onCerrar }) {
  const esEdicion = Boolean(proyecto);
  const [nombre, setNombre] = useState(proyecto?.nombre || "");
  const [descripcion, setDescripcion] = useState(proyecto?.descripcion || "");
  const [activo, setActivo] = useState(proyecto?.activo ?? true);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const [miEquipo, setMiEquipo] = useState([]);
  const [errorMiEquipo, setErrorMiEquipo] = useState("");
  const [encargadoId, setEncargadoId] = useState("");

  useEffect(() => {
    if (esEdicion) return;
    miEquipoApi.listar().then(setMiEquipo).catch(() => setErrorMiEquipo("No se pudo cargar tu equipo guardado."));
  }, [esEdicion]);

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
      } else {
        const nuevo = await proyectosApi.crear({ nombre, descripcion: descripcion || null, parent_id: parentId });
        if (encargadoId) {
          await proyectosApi.asignarRol(nuevo.id, {
            usuario_id: Number(encargadoId),
            rol: "N2",
            supervisor_id: null,
          });
        }
      }
      await onGuardado();
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

        {!esEdicion && (
          <label className="stack" style={{ gap: 4 }}>
            <span style={{ fontSize: "0.85rem" }}>Persona a cargo (opcional)</span>
            <select
              className="input"
              value={encargadoId}
              onChange={(e) => setEncargadoId(e.target.value)}
            >
              <option value="">Dejar en blanco (quedarás tú a cargo)</option>
              {miEquipo.map((m) => (
                <option key={m.usuario_id} value={m.usuario_id}>
                  {m.nombre}
                  {m.puesto ? ` — ${m.puesto}` : ""}
                </option>
              ))}
            </select>
            {errorMiEquipo && <p className="error-text">{errorMiEquipo}</p>}
          </label>
        )}

        {error && <p className="error-text">{error}</p>}
        <button className="btn btn--primary" type="submit" disabled={guardando}>
          {guardando ? "Guardando..." : esEdicion ? "Guardar cambios" : "Crear y cerrar"}
        </button>
      </form>
    </Modal>
  );
}

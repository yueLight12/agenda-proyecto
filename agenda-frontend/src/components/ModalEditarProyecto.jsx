import { useEffect, useState } from "react";
import { miEquipoApi, proyectosApi } from "../api/endpoints";
import { useAuth } from "../context/AuthContext";
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
// deja en blanco, el backend ya deja como encargado a quien crea el tema
// (ver rol_default_para_nuevo_proyecto/crear_proyecto en el backend) -- no
// hace falta ninguna llamada extra para ese caso.
//
// Si se elige a alguien, hereda el ROL REAL que ya tiene guardado en tu
// "Mi equipo" (N2, N3 o N4) -- antes SIEMPRE quedaba como N2 sin
// supervisor sin importar su rol real, lo que rompía la visibilidad si en
// realidad era tu N3/N4: al no tener supervisor_id apuntándote, dejabas
// de "verlo como tu equipo" en ese tema (ver listar_equipo_visible), y el
// selector de Responsable al crear una tarea ni siquiera lo mostraba
// (bug real, 2026-09-17: "Comprobaciones 2025", Beatriz/Judith).
// `onEliminar` (2026-09-18, solo lo pasa ListaProyectos.jsx) -- cuando
// viene, y estamos en modo edición de un SUBTEMA (parent_id no nulo, mismo
// límite que ya existía en TableroProyecto.jsx: no se puede eliminar un
// proyecto raíz desde aquí), se muestra un botón "Eliminar" junto a
// "Guardar cambios". La confirmación/aviso de qué se borra vive en quien
// llama (mismo patrón que ya usaba TableroProyecto con resumen-subarbol),
// este modal solo dispara el callback con el proyecto actual.
export default function ModalEditarProyecto({ proyecto = null, parentId = null, onGuardado, onCerrar, onEliminar }) {
  const { usuario: usuarioActual } = useAuth();
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
          const encargado = miEquipo.find((m) => m.usuario_id === Number(encargadoId));
          const rolEncargado = encargado?.rol || "N2";
          await proyectosApi.asignarRol(nuevo.id, {
            usuario_id: Number(encargadoId),
            rol: rolEncargado,
            supervisor_id: ["N3", "N4"].includes(rolEncargado) ? usuarioActual.id : null,
          });
        }
      }
      await onGuardado();
    } catch (err) {
      setError(err.response?.data?.detail || "No se pudo guardar el proyecto.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      titulo={esEdicion ? "Editar proyecto" : parentId ? "Nuevo subtema" : "Crear proyecto"}
      onCerrar={onCerrar}
    >
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
        {esEdicion && (
          <label className="list-inline" style={{ borderBottom: "none", paddingBottom: 0 }}>
            <span style={{ fontSize: "0.85rem" }}>Proyecto activo</span>
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
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn--primary" type="submit" disabled={guardando}>
            {guardando ? "Guardando..." : esEdicion ? "Guardar cambios" : "Crear y cerrar"}
          </button>
          {esEdicion && onEliminar && proyecto.parent_id !== null && (
            <button
              className="btn btn--ghost"
              type="button"
              style={{ color: "var(--color-danger)" }}
              onClick={() => onEliminar(proyecto)}
            >
              Eliminar
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}

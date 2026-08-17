import { useEffect, useState } from "react";
import { miEquipoApi, proyectosApi } from "../api/endpoints";
import { ROL_LABELS } from "../utils/rolLabels";
import Modal from "./Modal";

const ROLES = ["N1", "N2", "N3", "N4"];

// `proyecto` es opcional: si no viene, el modal entra en modo creación
// (mismo patrón de modal que el resto del sistema — antes "Crear proyecto"
// era el único "crear" que usaba un acordeón inline en vez de un modal).
// `parentId` (solo aplica en modo creación) crea un SUBTEMA dentro de ese
// nodo en vez de un proyecto/tema raíz (ver Fase 1 de jerarquía, 2026-08-16).
//
// En modo creación, un solo formulario: además de nombre/descripción, se
// puede armar de una vez la lista de gente a agregar (con su rol), tomada
// de tu plantilla personal "Mi equipo" -- pedido explícito de Yue,
// 2026-08-17 ("poder asignar al equipo al crear, o dejarlo para después,
// en el MISMO formulario"). Al confirmar, primero se crea el tema y luego
// se asigna cada persona pendiente, uno por uno. Para agregar a alguien
// que no está en tu plantilla, o gente después de creado, sigue estando
// "Administrar equipo" en la página del tema ya creado.
export default function ModalEditarProyecto({ proyecto = null, parentId = null, onGuardado, onCerrar }) {
  const esEdicion = Boolean(proyecto);
  const [nombre, setNombre] = useState(proyecto?.nombre || "");
  const [descripcion, setDescripcion] = useState(proyecto?.descripcion || "");
  const [activo, setActivo] = useState(proyecto?.activo ?? true);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const [miEquipo, setMiEquipo] = useState([]);
  const [errorMiEquipo, setErrorMiEquipo] = useState("");
  const [pickUsuarioId, setPickUsuarioId] = useState("");
  const [pickRol, setPickRol] = useState("N3");
  const [pickSupervisorId, setPickSupervisorId] = useState("");
  const [personasPendientes, setPersonasPendientes] = useState([]);

  useEffect(() => {
    if (esEdicion) return;
    miEquipoApi.listar().then(setMiEquipo).catch(() => setErrorMiEquipo("No se pudo cargar tu equipo guardado."));
  }, [esEdicion]);

  const disponibles = miEquipo.filter(
    (m) => !personasPendientes.some((p) => p.usuario_id === m.usuario_id)
  );
  const supervisoresPosibles = personasPendientes.filter((p) => p.rol === "N2");

  const agregarPendiente = () => {
    const persona = miEquipo.find((m) => m.usuario_id === Number(pickUsuarioId));
    if (!persona) return;
    setPersonasPendientes((prev) => [
      ...prev,
      {
        usuario_id: persona.usuario_id,
        nombre: persona.nombre,
        rol: pickRol,
        supervisor_id: (pickRol === "N3" || pickRol === "N4") && pickSupervisorId ? Number(pickSupervisorId) : null,
      },
    ]);
    setPickUsuarioId("");
    setPickRol("N3");
    setPickSupervisorId("");
  };

  const quitarPendiente = (usuarioId) => {
    setPersonasPendientes((prev) => prev.filter((p) => p.usuario_id !== usuarioId));
  };

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
        for (const p of personasPendientes) {
          await proyectosApi.asignarRol(nuevo.id, {
            usuario_id: p.usuario_id,
            rol: p.rol,
            supervisor_id: p.supervisor_id,
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
          <div className="stack" style={{ gap: 8, borderTop: "1px solid var(--color-border)", paddingTop: 12 }}>
            <span style={{ fontSize: "0.85rem" }}>Agregar personas (opcional)</span>
            <p style={{ color: "var(--color-text-muted)", fontSize: "0.78rem", margin: 0 }}>
              Puedes agregar ahora a gente de tu equipo guardado, o dejarlo para después desde
              "Administrar equipo" una vez creado el tema.
            </p>

            {errorMiEquipo && <p className="error-text">{errorMiEquipo}</p>}

            {personasPendientes.length > 0 && (
              <div className="stack" style={{ gap: 4 }}>
                {personasPendientes.map((p) => (
                  <div key={p.usuario_id} className="list-inline" style={{ padding: "4px 0" }}>
                    <span style={{ fontSize: "0.85rem" }}>
                      {p.nombre} — {ROL_LABELS[p.rol]}
                    </span>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      style={{ fontSize: "0.72rem", padding: "2px 6px" }}
                      onClick={() => quitarPendiente(p.usuario_id)}
                    >
                      Quitar
                    </button>
                  </div>
                ))}
              </div>
            )}

            {!errorMiEquipo && miEquipo.length === 0 && (
              <p style={{ color: "var(--color-text-muted)", fontSize: "0.8rem" }}>
                Tu equipo guardado está vacío — guarda gente en "Equipo" para poder agregarla aquí,
                o hazlo después desde "Administrar equipo".
              </p>
            )}

            {disponibles.length > 0 && (
              <div className="stack" style={{ gap: 8 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <select
                    className="input"
                    style={{ flex: 2, minWidth: 160 }}
                    value={pickUsuarioId}
                    onChange={(e) => setPickUsuarioId(e.target.value)}
                  >
                    <option value="">Selecciona a alguien de tu equipo</option>
                    {disponibles.map((m) => (
                      <option key={m.usuario_id} value={m.usuario_id}>
                        {m.nombre}
                        {m.puesto ? ` — ${m.puesto}` : ""}
                      </option>
                    ))}
                  </select>
                  <select
                    className="input"
                    style={{ flex: 1, minWidth: 120 }}
                    value={pickRol}
                    onChange={(e) => setPickRol(e.target.value)}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROL_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </div>
                {(pickRol === "N3" || pickRol === "N4") && (
                  <label className="stack" style={{ gap: 4 }}>
                    <span style={{ fontSize: "0.8rem" }}>Supervisor (opcional)</span>
                    <select
                      className="input"
                      value={pickSupervisorId}
                      onChange={(e) => setPickSupervisorId(e.target.value)}
                    >
                      <option value="">Dejar en blanco (quedarás tú como supervisor)</option>
                      {supervisoresPosibles.map((s) => (
                        <option key={s.usuario_id} value={s.usuario_id}>
                          {s.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <button
                  type="button"
                  className="btn btn--ghost"
                  style={{ alignSelf: "flex-start" }}
                  disabled={!pickUsuarioId}
                  onClick={agregarPendiente}
                >
                  Agregar a la lista
                </button>
              </div>
            )}
          </div>
        )}

        {error && <p className="error-text">{error}</p>}
        <button className="btn btn--primary" type="submit" disabled={guardando}>
          {guardando ? "Guardando..." : esEdicion ? "Guardar cambios" : "Crear"}
        </button>
        {!esEdicion && (
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.8rem" }}>
            {parentId
              ? "Quedarás como administrador de este subtema."
              : "Quedarás como Dirección de este tema."}
          </p>
        )}
      </form>
    </Modal>
  );
}

import { useEffect, useState } from "react";
import { miEquipoApi, proyectosApi, usuariosApi } from "../api/endpoints";
import { ROL_LABELS } from "../utils/rolLabels";
import ConfirmDialog from "./ConfirmDialog";
import KanbanEquipoProyecto from "./KanbanEquipoProyecto";
import Modal from "./Modal";

const ROLES = ["N1", "N2", "N3", "N4"];

export default function ModalEquipo({
  proyectoId,
  miembros,
  entregables = [],
  reuniones = [],
  titulo = "Administrar equipo del proyecto",
  // Rol efectivo de QUIEN ESTÁ VIENDO este modal en este proyecto (N1/N2, local
  // o heredado) -- decide de dónde sale la lista de "a quién puedo agregar"
  // (Yue, 2026-08-17: "un N2 solo debería poder administrar/asignar su
  // equipo"). Dirección (N1) sigue viendo el directorio completo de la
  // organización; un Líder (N2) solo ve a quien ya tiene guardado en su
  // propia plantilla "Mi equipo" -- para agregar a alguien totalmente
  // nuevo a la organización, primero lo guarda ahí. Si no se pasa (uso
  // legado), se trata como N2 por default -- más restrictivo, nunca más
  // permisivo de lo esperado.
  viewerRolEfectivo,
  onCambio,
  onCerrar,
}) {
  const [usuariosDisponibles, setUsuariosDisponibles] = useState([]);
  const [errorListaUsuarios, setErrorListaUsuarios] = useState("");
  const [usuarioId, setUsuarioId] = useState("");
  const [rol, setRol] = useState("N3");
  const [supervisorId, setSupervisorId] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [aplicandoPlantilla, setAplicandoPlantilla] = useState(false);
  const [errorPlantilla, setErrorPlantilla] = useState("");
  const [confirmandoQuitar, setConfirmandoQuitar] = useState(null); // usuario_id a quitar, o null
  const [quitando, setQuitando] = useState(false);
  const [errorQuitar, setErrorQuitar] = useState("");

  const esDireccion = viewerRolEfectivo === "N1";
  const supervisoresPosibles = miembros.filter((m) => m.rol === "N2");

  useEffect(() => {
    if (esDireccion) {
      usuariosApi
        .listar()
        .then(setUsuariosDisponibles)
        .catch(() =>
          setErrorListaUsuarios(
            "No se pudo cargar el listado de usuarios. Puedes reasignar el rol de miembros que ya están en el equipo."
          )
        );
    } else {
      miEquipoApi
        .listar()
        .then((plantilla) =>
          setUsuariosDisponibles(plantilla.map((m) => ({ id: m.usuario_id, nombre: m.nombre, puesto: m.puesto, email: m.email })))
        )
        .catch(() =>
          setErrorListaUsuarios(
            "No se pudo cargar tu equipo guardado. Puedes reasignar el rol de miembros que ya están en el equipo."
          )
        );
    }
  }, [esDireccion]);

  const handleAgregar = async (e) => {
    e.preventDefault();
    setError("");
    setGuardando(true);
    try {
      await proyectosApi.asignarRol(proyectoId, {
        usuario_id: Number(usuarioId),
        rol,
        supervisor_id:
          (rol === "N3" || rol === "N4") && supervisorId ? Number(supervisorId) : null,
      });
      setUsuarioId("");
      setRol("N3");
      setSupervisorId("");
      await onCambio();
    } catch (err) {
      setError(err.response?.data?.detail || "No se pudo asignar el rol.");
    } finally {
      setGuardando(false);
    }
  };

  const handleQuitar = (usuarioIdAQuitar) => {
    setErrorQuitar("");
    setConfirmandoQuitar(usuarioIdAQuitar);
  };

  const confirmarQuitar = async () => {
    setQuitando(true);
    setErrorQuitar("");
    try {
      await proyectosApi.quitarMiembro(proyectoId, confirmandoQuitar);
      setConfirmandoQuitar(null);
      await onCambio();
    } catch (err) {
      setErrorQuitar(err.response?.data?.detail || "No se pudo quitar al usuario.");
    } finally {
      setQuitando(false);
    }
  };

  const handleAplicarPlantilla = async () => {
    setErrorPlantilla("");
    setAplicandoPlantilla(true);
    try {
      await miEquipoApi.aplicarAProyecto(proyectoId);
      await onCambio();
    } catch (err) {
      setErrorPlantilla(err.response?.data?.detail || "No se pudo aplicar tu equipo guardado.");
    } finally {
      setAplicandoPlantilla(false);
    }
  };

  return (
    <Modal titulo={titulo} onCerrar={onCerrar}>
      <div className="stack">
        <div className="list-inline" style={{ borderBottom: "none" }}>
          <span style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
            ¿Siempre trabajas con las mismas personas?
          </span>
          <button
            className="btn btn--ghost"
            type="button"
            onClick={handleAplicarPlantilla}
            disabled={aplicandoPlantilla}
          >
            {aplicandoPlantilla ? "Aplicando..." : "Aplicar mi equipo"}
          </button>
        </div>
        {errorPlantilla && <p className="error-text">{errorPlantilla}</p>}
        {errorQuitar && <p className="error-text">{errorQuitar}</p>}

        <KanbanEquipoProyecto
          miembros={miembros}
          entregables={entregables}
          reuniones={reuniones}
          onQuitar={handleQuitar}
        />

        <form className="stack" onSubmit={handleAgregar}>
          <h3 style={{ fontSize: "0.95rem", margin: 0 }}>Agregar o reasignar miembro</h3>

          {errorListaUsuarios && <p className="error-text">{errorListaUsuarios}</p>}
          {!esDireccion && !errorListaUsuarios && usuariosDisponibles.length === 0 && (
            <p style={{ color: "var(--color-text-muted)", fontSize: "0.8rem" }}>
              Tu equipo guardado está vacío — guarda gente en "Equipo" para poder agregarla aquí.
            </p>
          )}

          <label className="stack" style={{ gap: 4 }}>
            <span style={{ fontSize: "0.85rem" }}>Usuario</span>
            {!esDireccion && (
              <span style={{ color: "var(--color-text-muted)", fontSize: "0.78rem" }}>
                Solo gente de tu equipo guardado ("Mi equipo").
              </span>
            )}
            <select
              className="input"
              value={usuarioId}
              onChange={(e) => setUsuarioId(e.target.value)}
              required
              disabled={usuariosDisponibles.length === 0}
            >
              <option value="" disabled>
                Selecciona un usuario
              </option>
              {usuariosDisponibles.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                  {u.puesto ? ` — ${u.puesto}` : ""} ({u.email})
                </option>
              ))}
            </select>
          </label>

          <label className="stack" style={{ gap: 4 }}>
            <span style={{ fontSize: "0.85rem" }}>Rol en este proyecto</span>
            <select className="input" value={rol} onChange={(e) => setRol(e.target.value)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROL_LABELS[r]}
                </option>
              ))}
            </select>
          </label>

          {(rol === "N3" || rol === "N4") && (
            <label className="stack" style={{ gap: 4 }}>
              <span style={{ fontSize: "0.85rem" }}>Supervisor (opcional)</span>
              <select
                className="input"
                value={supervisorId}
                onChange={(e) => setSupervisorId(e.target.value)}
              >
                <option value="">Dejar en blanco (quedarás tú como supervisor)</option>
                {supervisoresPosibles.map((s) => (
                  <option key={s.usuario_id} value={s.usuario_id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
              <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                Si lo dejas en blanco, quedarás tú como su supervisor.
              </span>
            </label>
          )}

          {error && <p className="error-text">{error}</p>}

          <button className="btn btn--primary" type="submit" disabled={guardando}>
            {guardando ? "Guardando..." : "Guardar"}
          </button>
        </form>
      </div>

      {confirmandoQuitar !== null && (
        <ConfirmDialog
          titulo="Quitar del proyecto"
          mensaje="¿Quitar a este usuario del proyecto?"
          textoConfirmar={quitando ? "Quitando..." : "Quitar"}
          onConfirmar={confirmarQuitar}
          onCancelar={() => setConfirmandoQuitar(null)}
        />
      )}
    </Modal>
  );
}

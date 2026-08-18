import { useEffect, useState } from "react";
import { miEquipoApi, usuariosApi } from "../api/endpoints";
import ConfirmDialog from "../components/ConfirmDialog";
import HistorialMinutas from "../components/HistorialMinutas";
import Modal from "../components/Modal";
import ResumenEquipo from "../components/ResumenEquipo";
import VistaEstatusEquipo from "../components/VistaEstatusEquipo";
import { ROL_LABELS, etiquetaRol } from "../utils/rolLabels";

const ROLES = ["N1", "N2", "N3", "N4"];

export default function Equipo() {
  const [vista, setVista] = useState("equipo"); // "equipo" | "estatus" | "historial"
  const [mostrarPlantilla, setMostrarPlantilla] = useState(false);

  return (
    <div className="stack">
      <div className="topbar">
        <h1>Equipo</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            className={`btn ${vista === "equipo" ? "btn--primary" : "btn--ghost"}`}
            type="button"
            onClick={() => setVista("equipo")}
          >
            Vista Equipo
          </button>
          <button
            className={`btn ${vista === "estatus" ? "btn--primary" : "btn--ghost"}`}
            type="button"
            onClick={() => setVista("estatus")}
          >
            Vista Estatus
          </button>
          <button
            className={`btn ${vista === "historial" ? "btn--primary" : "btn--ghost"}`}
            type="button"
            onClick={() => setVista("historial")}
          >
            Historial
          </button>
          <button className="btn btn--ghost" type="button" onClick={() => setMostrarPlantilla(true)}>
            Administrar equipo
          </button>
        </div>
      </div>

      {vista === "equipo" && <ResumenEquipo />}
      {vista === "estatus" && <VistaEstatusEquipo />}
      {vista === "historial" && <HistorialMinutas />}

      {mostrarPlantilla && (
        <Modal titulo="Administrar equipo (Plantilla)" onCerrar={() => setMostrarPlantilla(false)}>
          <PlantillaEquipo />
        </Modal>
      )}
    </div>
  );
}

function PlantillaEquipo() {
  const [miEquipo, setMiEquipo] = useState([]);
  const [usuariosDisponibles, setUsuariosDisponibles] = useState([]);
  const [tieneDirectorioGlobal, setTieneDirectorioGlobal] = useState(true);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const [personaNueva, setPersonaNueva] = useState(false);
  const [usuarioId, setUsuarioId] = useState("");
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [puestoNuevo, setPuestoNuevo] = useState("");
  const [emailNuevo, setEmailNuevo] = useState("");
  const [rol, setRol] = useState("N3");
  const [guardando, setGuardando] = useState(false);
  const [errorAgregar, setErrorAgregar] = useState("");
  const [exitoPersonaNueva, setExitoPersonaNueva] = useState("");
  const [confirmandoQuitar, setConfirmandoQuitar] = useState(null);
  const [quitando, setQuitando] = useState(false);
  const [errorQuitar, setErrorQuitar] = useState("");

  const cargar = () =>
    Promise.all([
      miEquipoApi.listar(),
      // Un Líder (N2) no tiene acceso al directorio global (GET /usuarios es
      // N1-únicamente, ver app/routers/usuarios.py) -- eso no es un error,
      // solo significa que para agregar gente usa "Es una persona nueva" de
      // abajo (o ya la tiene guardada). Un 403 aquí no debe mostrarse como
      // falla, solo apaga el selector de directorio.
      usuariosApi.listar().catch(() => {
        setTieneDirectorioGlobal(false);
        return [];
      }),
    ])
      .then(([equipo, usuarios]) => {
        setMiEquipo(equipo);
        setUsuariosDisponibles(usuarios);
      })
      .catch(() => setError("No se pudo cargar tu equipo. Intenta de nuevo más tarde."))
      .finally(() => setCargando(false));

  useEffect(() => {
    cargar();
  }, []);

  useEffect(() => {
    // Sin directorio global (cualquier Líder/N2) no hay "usuario existente"
    // que elegir -- la única vía es dar de alta a alguien nuevo.
    if (!tieneDirectorioGlobal) setPersonaNueva(true);
  }, [tieneDirectorioGlobal]);

  const handleAgregar = async (e) => {
    e.preventDefault();
    setErrorAgregar("");
    setExitoPersonaNueva("");
    setGuardando(true);
    try {
      if (personaNueva) {
        await miEquipoApi.agregarPersonaNueva({
          nombre: nombreNuevo,
          puesto: puestoNuevo || null,
          email: emailNuevo,
          rol,
        });
        setNombreNuevo("");
        setPuestoNuevo("");
        setEmailNuevo("");
        setExitoPersonaNueva(
          `Cuenta creada. Contraseña temporal: Demo1234! — pídele que la cambie en su primer inicio de sesión.`
        );
      } else {
        await miEquipoApi.agregar({ usuario_id: Number(usuarioId), rol });
        setUsuarioId("");
      }
      setRol("N3");
      await cargar();
    } catch (err) {
      setErrorAgregar(
        err.response?.data?.detail ||
          (personaNueva ? "No se pudo dar de alta a esta persona." : "No se pudo agregar a tu equipo.")
      );
    } finally {
      setGuardando(false);
    }
  };

  const handleQuitar = (usuarioIdAQuitar) => {
    setErrorQuitar("");
    setConfirmandoQuitar(usuarioIdAQuitar);
  };

  // Un reporte real (guardado=false, ver listar_mi_equipo_efectivo en el
  // backend) ya aparece en la lista sin guardarse a mano -- este botón solo
  // ofrece fijarlo en la plantilla de verdad, por si se quiere conservar
  // aunque deje de ser tu reporte real más adelante.
  const handleGuardarReporteReal = async (miembro) => {
    setErrorQuitar("");
    try {
      await miEquipoApi.agregar({ usuario_id: miembro.usuario_id, rol: miembro.rol });
      await cargar();
    } catch {
      setErrorQuitar("No se pudo guardar a esta persona en tu plantilla.");
    }
  };

  const confirmarQuitar = async () => {
    setQuitando(true);
    setErrorQuitar("");
    try {
      await miEquipoApi.quitar(confirmandoQuitar);
      setConfirmandoQuitar(null);
      await cargar();
    } catch {
      setErrorQuitar("No se pudo quitar a esta persona de tu equipo.");
    } finally {
      setQuitando(false);
    }
  };

  if (cargando) return <p>Cargando tu equipo...</p>;
  if (error) return <p className="error-text">{error}</p>;

  return (
    <div className="stack">
      <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
        Guarda aquí a las personas que siempre trabajan contigo (ej. "el equipo de David") para
        aplicarlas de un clic a cualquier tema, en vez de asignarlas una por una cada vez.
        Desde "Administrar equipo" dentro de un tema vas a poder usar el botón
        "Aplicar mi equipo".
      </p>

      {errorQuitar && <p className="error-text">{errorQuitar}</p>}

      <div className="card">
        {miEquipo.length === 0 && (
          <p style={{ color: "var(--color-text-muted)" }}>
            Todavía no has guardado a nadie — agrega a la primera persona con el formulario de
            abajo.
          </p>
        )}
        {miEquipo.map((m) => (
          <div className="list-inline" key={m.usuario_id}>
            <div>
              <strong>{m.nombre}</strong>{" "}
              {m.puesto && (
                <span style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
                  ({m.puesto})
                </span>
              )}{" "}
              <span style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
                {m.email} — {etiquetaRol(m.rol)}
                {!m.guardado && " — reporte real, sin guardar"}
              </span>
            </div>
            {m.guardado ? (
              <button className="btn btn--ghost" type="button" onClick={() => handleQuitar(m.usuario_id)}>
                Quitar
              </button>
            ) : (
              <button
                className="btn btn--ghost"
                type="button"
                onClick={() => handleGuardarReporteReal(m)}
              >
                Guardar en plantilla
              </button>
            )}
          </div>
        ))}
      </div>

      <form className="stack card" onSubmit={handleAgregar} style={{ maxWidth: 420 }}>
        <h3 style={{ fontSize: "0.95rem", margin: 0 }}>Agregar persona a mi equipo</h3>

        {tieneDirectorioGlobal && (
          <label className="list-inline" style={{ borderBottom: "none", gap: 8 }}>
            <span style={{ fontSize: "0.85rem" }}>Es una persona nueva, todavía no tiene cuenta</span>
            <input
              type="checkbox"
              checked={personaNueva}
              onChange={(e) => setPersonaNueva(e.target.checked)}
            />
          </label>
        )}

        {personaNueva ? (
          <>
            {!tieneDirectorioGlobal && (
              <p style={{ color: "var(--color-text-muted)", fontSize: "0.8rem" }}>
                Da de alta su cuenta aquí mismo — queda como colaborador interno o externo, en tu
                equipo guardado.
              </p>
            )}
            <label className="stack" style={{ gap: 4 }}>
              <span style={{ fontSize: "0.85rem" }}>Nombre</span>
              <input
                className="input"
                type="text"
                value={nombreNuevo}
                onChange={(e) => setNombreNuevo(e.target.value)}
                required
              />
            </label>
            <label className="stack" style={{ gap: 4 }}>
              <span style={{ fontSize: "0.85rem" }}>Puesto (opcional)</span>
              <input
                className="input"
                type="text"
                value={puestoNuevo}
                onChange={(e) => setPuestoNuevo(e.target.value)}
              />
            </label>
            <label className="stack" style={{ gap: 4 }}>
              <span style={{ fontSize: "0.85rem" }}>Email</span>
              <input
                className="input"
                type="email"
                value={emailNuevo}
                onChange={(e) => setEmailNuevo(e.target.value)}
                required
              />
            </label>
          </>
        ) : (
          <label className="stack" style={{ gap: 4 }}>
            <span style={{ fontSize: "0.85rem" }}>Usuario</span>
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
        )}

        <label className="stack" style={{ gap: 4 }}>
          <span style={{ fontSize: "0.85rem" }}>
            {personaNueva ? "Rol" : "Rol por default al aplicar la plantilla"}
          </span>
          <select className="input" value={rol} onChange={(e) => setRol(e.target.value)}>
            {(personaNueva ? ["N3", "N4"] : ROLES).map((r) => (
              <option key={r} value={r}>
                {ROL_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        {personaNueva && (
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.78rem" }}>
            Solo colaborador interno o externo — dar de alta a alguien como dirección o líder
            sigue siendo exclusivo de Dirección.
          </p>
        )}

        {exitoPersonaNueva && <p style={{ color: "var(--color-success, green)" }}>{exitoPersonaNueva}</p>}
        {errorAgregar && <p className="error-text">{errorAgregar}</p>}
        <button className="btn btn--primary" type="submit" disabled={guardando}>
          {guardando ? "Guardando..." : personaNueva ? "Dar de alta y agregar" : "Agregar a mi equipo"}
        </button>
      </form>

      {confirmandoQuitar !== null && (
        <ConfirmDialog
          titulo="Quitar de mi equipo"
          mensaje="¿Quitar a esta persona de tu equipo guardado?"
          textoConfirmar={quitando ? "Quitando..." : "Quitar"}
          onConfirmar={confirmarQuitar}
          onCancelar={() => setConfirmandoQuitar(null)}
        />
      )}
    </div>
  );
}

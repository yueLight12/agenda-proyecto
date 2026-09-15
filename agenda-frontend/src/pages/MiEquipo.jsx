import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { miEquipoApi } from "../api/endpoints";
import { ROL_LABELS } from "../utils/rolLabels";
import ConfirmDialog from "../components/ConfirmDialog";
import Modal from "../components/Modal";

const ROLES_ALTA = ["N3", "N4"];
const CAMPOS_VACIOS = { nombre: "", puesto: "", email: "", rol: "N3" };

// Pantalla de autoservicio (2026-09-15, a petición de Yue) -- hasta ahora
// solo Dirección/superadmin podía dar de alta gente nueva (panel Admin) y
// asignarle jefe (ModalEquipo, dentro de un proyecto). El backend YA tenía
// todo lo necesario para que cualquier líder (N2) diera de alta a alguien
// de SU equipo sin depender de un N1 -- ver POST /mi-equipo/nueva-persona
// en app/routers/equipos.py -- pero no existía ninguna pantalla que lo
// usara. Esta es esa pantalla.
function ModalAgregarPersona({ onGuardar, onCerrar, error, guardando }) {
  const [campos, setCampos] = useState(CAMPOS_VACIOS);
  const cambiar = (campo) => (e) => setCampos((c) => ({ ...c, [campo]: e.target.value }));

  return (
    <Modal titulo="Agregar persona nueva a mi equipo" onCerrar={onCerrar}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          onGuardar(campos);
        }}
      >
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem", margin: 0 }}>
          Crea la cuenta y la agrega de una vez a tu equipo guardado -- no necesitas pedirle a un
          administrador que la dé de alta.
        </p>
        <label className="stack" style={{ gap: 4 }}>
          <span style={{ fontSize: "0.85rem" }}>Nombre</span>
          <input className="input" value={campos.nombre} onChange={cambiar("nombre")} required />
        </label>
        <label className="stack" style={{ gap: 4 }}>
          <span style={{ fontSize: "0.85rem" }}>Puesto</span>
          <input className="input" value={campos.puesto} onChange={cambiar("puesto")} />
        </label>
        <label className="stack" style={{ gap: 4 }}>
          <span style={{ fontSize: "0.85rem" }}>Email</span>
          <input
            className="input"
            type="email"
            value={campos.email}
            onChange={cambiar("email")}
            required
          />
        </label>
        <label className="stack" style={{ gap: 4 }}>
          <span style={{ fontSize: "0.85rem" }}>Rol</span>
          <select className="input" value={campos.rol} onChange={cambiar("rol")}>
            {ROLES_ALTA.map((r) => (
              <option key={r} value={r}>
                {ROL_LABELS[r]}
              </option>
            ))}
          </select>
        </label>

        {error && <p className="error-text">{error}</p>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="btn btn--ghost" onClick={onCerrar}>
            Cancelar
          </button>
          <button className="btn btn--primary" type="submit" disabled={guardando}>
            {guardando ? "Creando..." : "Crear y agregar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function MiEquipo() {
  const [equipo, setEquipo] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [modalAbierto, setModalAbierto] = useState(false);
  const [errorModal, setErrorModal] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [creado, setCreado] = useState(null); // { nombre, email } tras dar de alta -- para mostrar la contraseña por defecto una sola vez
  const [confirmandoQuitar, setConfirmandoQuitar] = useState(null);
  const [quitando, setQuitando] = useState(false);
  const [errorQuitar, setErrorQuitar] = useState("");

  const cargar = () => {
    setCargando(true);
    setError("");
    miEquipoApi
      .listar()
      .then(setEquipo)
      .catch(() => setError("No se pudo cargar tu equipo."))
      .finally(() => setCargando(false));
  };

  useEffect(() => {
    cargar();
  }, []);

  const agregarPersona = async (campos) => {
    setErrorModal("");
    setGuardando(true);
    try {
      await miEquipoApi.agregarPersonaNueva(campos);
      setModalAbierto(false);
      setCreado({ nombre: campos.nombre, email: campos.email });
      cargar();
    } catch (err) {
      setErrorModal(err.response?.data?.detail || "No se pudo agregar a esta persona.");
    } finally {
      setGuardando(false);
    }
  };

  const confirmarQuitar = async () => {
    setQuitando(true);
    setErrorQuitar("");
    try {
      await miEquipoApi.quitar(confirmandoQuitar);
      setConfirmandoQuitar(null);
      cargar();
    } catch (err) {
      setErrorQuitar(err.response?.data?.detail || "No se pudo quitar a esta persona.");
    } finally {
      setQuitando(false);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0 }}>Mi equipo</h1>
          <Link to="/">← Volver a Mi Chamba</Link>
        </div>
        <button type="button" className="btn btn--primary" onClick={() => setModalAbierto(true)}>
          + Agregar persona nueva
        </button>
      </div>

      {creado && (
        <p
          style={{
            background: "var(--color-superficie-alterna, #f0f4f8)",
            padding: "10px 14px",
            borderRadius: 8,
            fontSize: "0.85rem",
          }}
        >
          Listo, se creó la cuenta de <strong>{creado.nombre}</strong> ({creado.email}) con la
          contraseña por defecto <strong>Demo1234!</strong> -- pídele que la cambie en su primer
          inicio de sesión, desde "Mi perfil".{" "}
          <button
            type="button"
            className="btn btn--ghost"
            style={{ padding: "0 4px" }}
            onClick={() => setCreado(null)}
          >
            Cerrar
          </button>
        </p>
      )}

      <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
        Esta es tu plantilla personal de equipo -- de aquí sale la lista de personas que puedes
        asignar a un proyecto de un clic ("Aplicar mi equipo"), y quién queda como su jefe directo
        (tú) al aplicarla.
      </p>

      {cargando && <p style={{ color: "var(--color-text-muted)" }}>Cargando...</p>}
      {error && <p className="error-text">{error}</p>}
      {errorQuitar && <p className="error-text">{errorQuitar}</p>}

      {!cargando && !error && equipo.length === 0 && (
        <p style={{ color: "var(--color-text-muted)" }}>
          Todavía no tienes a nadie en tu equipo -- agrega a la primera persona con el botón de
          arriba.
        </p>
      )}

      {!cargando && !error && equipo.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table className="planb__rendimiento-tabla">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Email</th>
                <th>Puesto</th>
                <th>Rol</th>
                <th>Origen</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {equipo.map((m) => (
                <tr key={m.usuario_id}>
                  <td>{m.nombre}</td>
                  <td>{m.email}</td>
                  <td>{m.puesto || "—"}</td>
                  <td>{ROL_LABELS[m.rol] || m.rol}</td>
                  <td>
                    {m.guardado
                      ? "Guardado en tu plantilla"
                      : "Ya es tu reporte real en algún proyecto"}
                  </td>
                  <td>
                    {m.guardado ? (
                      <button
                        type="button"
                        className="btn btn--ghost"
                        onClick={() => setConfirmandoQuitar(m.usuario_id)}
                      >
                        Quitar
                      </button>
                    ) : (
                      <span style={{ color: "var(--color-text-muted)", fontSize: "0.8rem" }}>
                        —
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalAbierto && (
        <ModalAgregarPersona
          onGuardar={agregarPersona}
          onCerrar={() => {
            setModalAbierto(false);
            setErrorModal("");
          }}
          error={errorModal}
          guardando={guardando}
        />
      )}

      {confirmandoQuitar !== null && (
        <ConfirmDialog
          titulo="Quitar de mi equipo"
          mensaje="¿Quitar a esta persona de tu equipo guardado? (no la elimina del sistema, solo de tu plantilla)"
          textoConfirmar={quitando ? "Quitando..." : "Quitar"}
          onConfirmar={confirmarQuitar}
          onCancelar={() => setConfirmandoQuitar(null)}
        />
      )}
    </div>
  );
}

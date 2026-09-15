import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { adminApi, usuariosApi } from "../api/endpoints";
import Modal from "../components/Modal";
import PageHeader from "../components/PageHeader";

function ModalReasignar({ origen, usuarios, onReasignar, onCerrar, error, guardando }) {
  const opciones = usuarios.filter((u) => u.id !== origen.id);
  const [destinoId, setDestinoId] = useState(opciones[0]?.id || "");

  return (
    <Modal titulo={`Reasignar todo lo de ${origen.nombre}`} onCerrar={onCerrar}>
      <div className="stack">
        <p style={{ fontSize: "0.9rem", color: "var(--color-text-muted)" }}>
          Mueve todas las tareas, reuniones, notas, roles y demás historial de{" "}
          <strong>{origen.nombre}</strong> a otra persona. No toca sus datos privados
          (preferencias, pendientes personales). Útil antes de eliminarlo.
        </p>
        <label className="stack" style={{ gap: 4 }}>
          <span style={{ fontSize: "0.85rem" }}>Pasarle todo a:</span>
          <select className="input" value={destinoId} onChange={(e) => setDestinoId(e.target.value)}>
            {opciones.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="error-text">{error}</p>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="btn btn--ghost" onClick={onCerrar}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={guardando || !destinoId}
            onClick={() => onReasignar(Number(destinoId))}
          >
            {guardando ? "Reasignando..." : "Reasignar todo"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Panel de administración de usuarios (2026-09-07, a petición de Yue:
// "solo yo o tú podemos agregar usuarios insertándolos en el código" --
// ya existía POST/PATCH /usuarios en el backend, restringido a Dirección
// (N1) o superadmin, pero NINGUNA pantalla lo usaba; se creaba/editaba
// todo por scripts. Esta pantalla es la primera en exponerlo.
//
// Acceso: el backend YA valida todo con _requerir_n1/_requerir_super_admin
// en cada endpoint (ver app/routers/usuarios.py) -- el gate de aquí abajo
// es solo para no mostrar una pantalla que de todos modos rechazaría cada
// acción; la seguridad real vive en el backend, no aquí.
const CAMPOS_VACIOS = { nombre: "", puesto: "", email: "", password: "", telefono_whatsapp: "" };

function FormularioUsuario({ inicial, esNuevo, onGuardar, onCerrar, error, guardando }) {
  const [campos, setCampos] = useState(inicial);

  const cambiar = (campo) => (e) => setCampos((c) => ({ ...c, [campo]: e.target.value }));

  return (
    <Modal titulo={esNuevo ? "Nuevo usuario" : `Editar a ${inicial.nombre}`} onCerrar={onCerrar}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          onGuardar(campos);
        }}
      >
        <label className="stack" style={{ gap: 4 }}>
          <span style={{ fontSize: "0.85rem" }}>Nombre</span>
          <input className="input" value={campos.nombre} onChange={cambiar("nombre")} required />
        </label>
        <label className="stack" style={{ gap: 4 }}>
          <span style={{ fontSize: "0.85rem" }}>Puesto</span>
          <input className="input" value={campos.puesto || ""} onChange={cambiar("puesto")} />
        </label>
        {esNuevo && (
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
        )}
        {!esNuevo && (
          <label className="stack" style={{ gap: 4 }}>
            <span style={{ fontSize: "0.85rem" }}>Teléfono WhatsApp (avisos urgentes)</span>
            <input
              className="input"
              type="tel"
              placeholder="+521234567890"
              value={campos.telefono_whatsapp || ""}
              onChange={cambiar("telefono_whatsapp")}
            />
          </label>
        )}
        <label className="stack" style={{ gap: 4 }}>
          <span style={{ fontSize: "0.85rem" }}>
            {esNuevo ? "Contraseña" : "Nueva contraseña (dejar vacío para no cambiarla)"}
          </span>
          <input
            className="input"
            type="password"
            value={campos.password || ""}
            onChange={cambiar("password")}
            required={esNuevo}
          />
        </label>

        {error && <p className="error-text">{error}</p>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="btn btn--ghost" onClick={onCerrar}>
            Cancelar
          </button>
          <button className="btn btn--primary" type="submit" disabled={guardando}>
            {guardando ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function AdminUsuarios() {
  const { usuario: usuarioActual } = useAuth();
  const [usuarios, setUsuarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null); // { modo: "nuevo" | "editar" | "reasignar", usuario? }
  const [errorModal, setErrorModal] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [auditoria, setAuditoria] = useState([]);
  const [terminos, setTerminos] = useState([]);
  const [nuevoTermino, setNuevoTermino] = useState("");
  const [errorTerminos, setErrorTerminos] = useState("");
  const [guardandoTermino, setGuardandoTermino] = useState(false);

  const cargar = () => {
    setCargando(true);
    setError("");
    usuariosApi
      .listar()
      .then(setUsuarios)
      .catch(() => setError("No se pudo cargar la lista de usuarios."))
      .finally(() => setCargando(false));
  };

  const cargarAuditoria = () => {
    adminApi.obtenerAuditoria().then(setAuditoria).catch(() => {});
  };

  const cargarTerminos = () => {
    adminApi.obtenerTerminosSensibles().then(setTerminos).catch(() => {});
  };

  useEffect(() => {
    cargar();
    cargarAuditoria();
    cargarTerminos();
  }, []);

  const agregarTermino = async (e) => {
    e.preventDefault();
    setErrorTerminos("");
    setGuardandoTermino(true);
    try {
      await adminApi.agregarTerminoSensible(nuevoTermino);
      setNuevoTermino("");
      cargarTerminos();
    } catch (err) {
      setErrorTerminos(err.response?.data?.detail || "No se pudo agregar el término.");
    } finally {
      setGuardandoTermino(false);
    }
  };

  const quitarTermino = async (id) => {
    setErrorTerminos("");
    try {
      await adminApi.quitarTerminoSensible(id);
      cargarTerminos();
    } catch (err) {
      setErrorTerminos(err.response?.data?.detail || "No se pudo quitar el término.");
    }
  };

  if (!usuarioActual?.es_super_admin) {
    return (
      <div className="planb">
        <PageHeader titulo="Administración de usuarios" />
        <div className="planb__contenido">
          <p style={{ color: "var(--color-text-muted)" }}>No tienes acceso a esta pantalla.</p>
        </div>
      </div>
    );
  }

  const guardarNuevo = async (campos) => {
    setGuardando(true);
    setErrorModal("");
    try {
      await usuariosApi.crear({
        nombre: campos.nombre,
        puesto: campos.puesto || null,
        email: campos.email,
        password: campos.password,
      });
      setModal(null);
      cargar();
    } catch (err) {
      setErrorModal(err.response?.data?.detail || "No se pudo crear el usuario.");
    } finally {
      setGuardando(false);
    }
  };

  const guardarEdicion = async (campos) => {
    setGuardando(true);
    setErrorModal("");
    try {
      const datos = {
        nombre: campos.nombre,
        puesto: campos.puesto || null,
        telefono_whatsapp: campos.telefono_whatsapp?.trim() || null,
      };
      if (campos.password) datos.password = campos.password;
      await usuariosApi.actualizar(modal.usuario.id, datos);
      setModal(null);
      cargar();
    } catch (err) {
      setErrorModal(err.response?.data?.detail || "No se pudo guardar el cambio.");
    } finally {
      setGuardando(false);
    }
  };

  const alternarActivo = async (u) => {
    try {
      await usuariosApi.actualizar(u.id, { activo: !u.activo });
      cargar();
    } catch (err) {
      setError(err.response?.data?.detail || "No se pudo cambiar el estatus.");
    }
  };

  const alternarSuperAdmin = async (u) => {
    try {
      await usuariosApi.actualizar(u.id, { es_super_admin: !u.es_super_admin });
      cargar();
    } catch (err) {
      setError(err.response?.data?.detail || "No se pudo cambiar el rol de superadmin.");
    }
  };

  const eliminar = async (u) => {
    if (!window.confirm(`¿Eliminar a "${u.nombre}"? Esto no se puede deshacer.`)) return;
    try {
      await usuariosApi.eliminar(u.id);
      cargar();
    } catch (err) {
      setError(err.response?.data?.detail || "No se pudo eliminar.");
    }
  };

  const reasignar = async (destinoId) => {
    setGuardando(true);
    setErrorModal("");
    try {
      await adminApi.reasignarTodo(modal.usuario.id, destinoId);
      setModal(null);
      cargar();
      cargarConfigYAuditoria();
    } catch (err) {
      setErrorModal(err.response?.data?.detail || "No se pudo reasignar.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="planb">
      <PageHeader
        titulo="Administración de usuarios"
        acciones={
          <button type="button" className="btn btn--primary" onClick={() => setModal({ modo: "nuevo" })}>
            + Nuevo usuario
          </button>
        }
      />
      <div className="planb__contenido stack">

      {cargando && <p style={{ color: "var(--color-text-muted)" }}>Cargando...</p>}
      {error && <p className="error-text">{error}</p>}

      {!cargando && !error && (
        <div style={{ overflowX: "auto" }}>
          <table className="planb__rendimiento-tabla">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Email</th>
                <th>Puesto</th>
                <th>WhatsApp</th>
                <th>Activo</th>
                <th>Superadmin</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id}>
                  <td>{u.nombre}</td>
                  <td>{u.email}</td>
                  <td>{u.puesto || "—"}</td>
                  <td>{u.telefono_whatsapp || "—"}</td>
                  <td>
                    <button type="button" className="btn btn--ghost" onClick={() => alternarActivo(u)}>
                      {u.activo ? "✅ Activo" : "🚫 Inactivo"}
                    </button>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => alternarSuperAdmin(u)}
                      disabled={u.id === usuarioActual.id}
                      title={u.id === usuarioActual.id ? "No puedes quitarte tu propio superadmin" : ""}
                    >
                      {u.es_super_admin ? "🛡️ Sí" : "No"}
                    </button>
                  </td>
                  <td style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => setModal({ modo: "editar", usuario: u })}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => setModal({ modo: "reasignar", usuario: u })}
                    >
                      Reasignar todo
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => eliminar(u)}
                      disabled={u.id === usuarioActual.id}
                      title={u.id === usuarioActual.id ? "No puedes eliminar tu propia cuenta" : ""}
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 32 }}>
        <h2>Términos sensibles (contenido bloqueado)</h2>
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
          Si el nombre de una tarea, reunión, proyecto o nota contiene alguna de estas palabras o
          frases, se rechaza al guardarse y queda registrado abajo, en "Registro de auditoría"
          (acción <code>contenido_sensible_bloqueado</code>) -- quién lo intentó, cuándo, y el
          texto exacto.
        </p>
        <form onSubmit={agregarTermino} style={{ display: "flex", gap: 8, maxWidth: 500 }}>
          <input
            className="input"
            placeholder='Ej. "nombre de una persona" o "asunto delicado"'
            value={nuevoTermino}
            onChange={(e) => setNuevoTermino(e.target.value)}
            required
          />
          <button className="btn btn--primary" type="submit" disabled={guardandoTermino}>
            {guardandoTermino ? "Agregando..." : "Agregar"}
          </button>
        </form>
        {errorTerminos && <p className="error-text">{errorTerminos}</p>}
        {terminos.length === 0 ? (
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
            No hay ningún término bloqueado todavía.
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, marginTop: 12, maxWidth: 500 }}>
            {terminos.map((t) => (
              <li
                key={t.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "6px 0",
                  borderBottom: "1px solid var(--color-borde, #e5e5e5)",
                }}
              >
                <span>{t.texto}</span>
                <button type="button" className="btn btn--ghost" onClick={() => quitarTermino(t.id)}>
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {auditoria.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <h2>Registro de auditoría</h2>
          <div style={{ overflowX: "auto" }}>
            <table className="planb__rendimiento-tabla">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Quién</th>
                  <th>Acción</th>
                  <th>Sobre</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {auditoria.map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.fecha).toLocaleString()}</td>
                    <td>{r.actor_nombre}</td>
                    <td>{r.accion}</td>
                    <td>{r.objetivo_nombre || "—"}</td>
                    <td style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                      {r.detalle ? JSON.stringify(r.detalle) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal?.modo === "reasignar" && (
        <ModalReasignar
          origen={modal.usuario}
          usuarios={usuarios}
          onReasignar={reasignar}
          onCerrar={() => setModal(null)}
          error={errorModal}
          guardando={guardando}
        />
      )}

      {modal?.modo === "nuevo" && (
        <FormularioUsuario
          inicial={CAMPOS_VACIOS}
          esNuevo
          onGuardar={guardarNuevo}
          onCerrar={() => setModal(null)}
          error={errorModal}
          guardando={guardando}
        />
      )}
      {modal?.modo === "editar" && (
        <FormularioUsuario
          inicial={{ ...CAMPOS_VACIOS, ...modal.usuario, password: "" }}
          esNuevo={false}
          onGuardar={guardarEdicion}
          onCerrar={() => setModal(null)}
          error={errorModal}
          guardando={guardando}
        />
      )}
      </div>
    </div>
  );
}

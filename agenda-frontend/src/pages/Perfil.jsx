import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { usuariosApi } from "../api/endpoints";
import ModalCambiarPassword from "../components/ModalCambiarPassword";
import { useAuth } from "../context/AuthContext";
import { etiquetaRol } from "../utils/rolLabels";

/**
 * "Mi perfil" (2026-08-17, pedido de Yue): ficha de solo lectura con los
 * datos que YA existen en el sistema -- nombre/puesto/email y temas/roles.
 * Sin `usuarioId` en la ruta: tu propio perfil, sacado directo de
 * `useAuth().usuario` (ya trae roles_por_proyecto vía GET /auth/me, sin
 * llamada nueva). Con `usuarioId` (ruta /perfil/:usuarioId, ampliado el
 * mismo día para que un líder vea la ficha de un subordinado): se pide a
 * GET /usuarios/{id}/perfil, que el backend filtra a "solo si tienes
 * visibilidad legítima" (ver app/services/usuarios.py) -- un 403 aquí
 * significa que no hay relación de equipo con esa persona en ningún tema.
 * Cambiar nombre/puesto sigue siendo tarea de Dirección (como hoy) --
 * "Cambiar contraseña" solo se ofrece para el propio perfil.
 */
export default function Perfil() {
  const { usuarioId } = useParams();
  const { usuario: usuarioActual, refrescarPerfil } = useAuth();
  const esPropio = !usuarioId;

  const [perfil, setPerfil] = useState(esPropio ? usuarioActual : null);
  const [cargando, setCargando] = useState(!esPropio);
  const [error, setError] = useState("");
  const [mostrarCambiarPassword, setMostrarCambiarPassword] = useState(false);
  const [editandoTelefono, setEditandoTelefono] = useState(false);
  const [telefonoInput, setTelefonoInput] = useState("");
  const [guardandoTelefono, setGuardandoTelefono] = useState(false);
  const [errorTelefono, setErrorTelefono] = useState("");

  useEffect(() => {
    if (esPropio) {
      setPerfil(usuarioActual);
      return;
    }
    setCargando(true);
    setError("");
    usuariosApi
      .perfil(usuarioId)
      .then(setPerfil)
      .catch((err) =>
        setError(
          err.response?.status === 403
            ? "No tienes acceso al perfil de este usuario."
            : "No se pudo cargar este perfil."
        )
      )
      .finally(() => setCargando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuarioId]);

  if (cargando) return <p>Cargando perfil...</p>;
  if (error) return <p className="error-text">{error}</p>;
  if (!perfil) return null;

  const iniciarEdicionTelefono = () => {
    setTelefonoInput(perfil.telefono_whatsapp || "");
    setErrorTelefono("");
    setEditandoTelefono(true);
  };

  const guardarTelefono = async () => {
    setGuardandoTelefono(true);
    setErrorTelefono("");
    try {
      const actualizado = await usuariosApi.actualizarMiTelefono(telefonoInput.trim() || null);
      setPerfil(actualizado);
      await refrescarPerfil();
      setEditandoTelefono(false);
    } catch {
      setErrorTelefono("No se pudo guardar el teléfono.");
    } finally {
      setGuardandoTelefono(false);
    }
  };

  return (
    <div className="stack">
      <h1>{esPropio ? "Mi perfil" : perfil.nombre}</h1>

      <div className="card stack" style={{ maxWidth: 480, gap: 10 }}>
        <div>
          <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>Nombre</span>
          <p style={{ margin: 0 }}>{perfil.nombre}</p>
        </div>
        <div>
          <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>Puesto</span>
          <p style={{ margin: 0 }}>{perfil.puesto || "—"}</p>
        </div>
        <div>
          <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>Email</span>
          <p style={{ margin: 0 }}>{perfil.email}</p>
        </div>
        <div>
          <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
            Teléfono WhatsApp (avisos urgentes)
          </span>
          {esPropio && editandoTelefono ? (
            <div className="stack" style={{ gap: 6, marginTop: 4 }}>
              <input
                type="tel"
                className="input"
                placeholder="+525512345678"
                value={telefonoInput}
                onChange={(e) => setTelefonoInput(e.target.value)}
              />
              {errorTelefono && <p className="error-text" style={{ margin: 0 }}>{errorTelefono}</p>}
              <div className="list-inline">
                <button
                  className="btn btn--primary"
                  type="button"
                  disabled={guardandoTelefono}
                  onClick={guardarTelefono}
                >
                  Guardar
                </button>
                <button
                  className="btn btn--ghost"
                  type="button"
                  disabled={guardandoTelefono}
                  onClick={() => setEditandoTelefono(false)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="list-inline">
              <p style={{ margin: 0 }}>{perfil.telefono_whatsapp || "—"}</p>
              {esPropio && (
                <button className="btn btn--ghost" type="button" onClick={iniciarEdicionTelefono}>
                  Editar
                </button>
              )}
            </div>
          )}
        </div>
        {esPropio && (
          <button
            className="btn btn--ghost"
            type="button"
            onClick={() => setMostrarCambiarPassword(true)}
            style={{ alignSelf: "flex-start" }}
          >
            Cambiar contraseña
          </button>
        )}
      </div>

      <div className="card">
        <h3 style={{ fontSize: "0.95rem", margin: "0 0 8px" }}>
          {esPropio ? "Tus temas y roles" : "Temas y roles en común"}
        </h3>
        {(!perfil.roles_por_proyecto || perfil.roles_por_proyecto.length === 0) && (
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
            {esPropio
              ? "Todavía no participas en ningún tema."
              : "No hay temas en común visibles para ti."}
          </p>
        )}
        {perfil.roles_por_proyecto?.map((r) => (
          <div className="list-inline" key={r.proyecto_id}>
            <span>{r.proyecto_nombre}</span>
            <span style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
              {etiquetaRol(r.rol)}
            </span>
          </div>
        ))}
      </div>

      {mostrarCambiarPassword && (
        <ModalCambiarPassword onCerrar={() => setMostrarCambiarPassword(false)} />
      )}
    </div>
  );
}

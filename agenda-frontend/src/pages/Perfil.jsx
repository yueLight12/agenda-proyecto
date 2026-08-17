import { useState } from "react";
import ModalCambiarPassword from "../components/ModalCambiarPassword";
import { useAuth } from "../context/AuthContext";
import { etiquetaRol } from "../utils/rolLabels";

/**
 * "Mi perfil" (2026-08-17, pedido de Yue): ficha de solo lectura con los
 * datos que YA existen en el sistema -- nombre/puesto/email y tus
 * temas/roles actuales. `useAuth().usuario` ya trae `roles_por_proyecto`
 * (GET /auth/me = UsuarioConRolesOut), así que no hace falta ninguna
 * llamada nueva al backend. Cambiar nombre/puesto sigue siendo tarea de
 * Dirección (como hoy, vía POST/PATCH /usuarios) -- decidido con Yue no
 * hacerlo editable en esta ronda. "Cambiar contraseña" se deja disponible
 * aquí también (mismo modal que ya existe en el sidebar, sin duplicar
 * lógica).
 */
export default function Perfil() {
  const { usuario } = useAuth();
  const [mostrarCambiarPassword, setMostrarCambiarPassword] = useState(false);

  if (!usuario) return null;

  return (
    <div className="stack">
      <h1>Mi perfil</h1>

      <div className="card stack" style={{ maxWidth: 480, gap: 10 }}>
        <div>
          <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>Nombre</span>
          <p style={{ margin: 0 }}>{usuario.nombre}</p>
        </div>
        <div>
          <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>Puesto</span>
          <p style={{ margin: 0 }}>{usuario.puesto || "—"}</p>
        </div>
        <div>
          <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>Email</span>
          <p style={{ margin: 0 }}>{usuario.email}</p>
        </div>
        <button
          className="btn btn--ghost"
          type="button"
          onClick={() => setMostrarCambiarPassword(true)}
          style={{ alignSelf: "flex-start" }}
        >
          Cambiar contraseña
        </button>
      </div>

      <div className="card">
        <h3 style={{ fontSize: "0.95rem", margin: "0 0 8px" }}>Tus temas y roles</h3>
        {(!usuario.roles_por_proyecto || usuario.roles_por_proyecto.length === 0) && (
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
            Todavía no participas en ningún tema.
          </p>
        )}
        {usuario.roles_por_proyecto?.map((r) => (
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

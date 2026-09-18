import { useAuth } from "../context/AuthContext";

// Banner fijo mientras el superadmin está "viendo como" otra persona
// (2026-09-17) -- siempre visible para que nunca se confunda con estar
// realmente logueado como ella. Ver AuthContext.jsx (entrarComoOtraPersona/
// volverAMiCuenta) y AdminUsuarios.jsx para el botón que dispara esto.
export default function AvisoVerComo() {
  const { usuario, viendoComoOtraPersona, volverAMiCuenta } = useAuth();

  if (!viendoComoOtraPersona) return null;

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        top: 0,
        zIndex: 1200,
        background: "#7c2d12",
        color: "#fff",
        padding: "8px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        fontSize: "0.85rem",
        flexWrap: "wrap",
      }}
    >
      <span>
        👁️ Viendo como <strong>{usuario?.nombre || "..."}</strong>
      </span>
      <button
        type="button"
        className="btn btn--ghost"
        style={{ color: "#fff", borderColor: "rgba(255,255,255,0.5)" }}
        onClick={volverAMiCuenta}
      >
        Volver a mi cuenta
      </button>
    </div>
  );
}

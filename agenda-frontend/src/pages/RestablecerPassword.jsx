import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { authApi } from "../api/endpoints";

// Destino del link enviado por /auth/olvide-password (2026-09-23) -- pide
// el token de la URL (?token=...) y la contraseña nueva. Sin
// autenticación previa, el token ES la credencial (ver
// app/services/reset_password_tokens.py, un solo uso, 30 min).
export default function RestablecerPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const navigate = useNavigate();

  const [passwordNueva, setPasswordNueva] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [listo, setListo] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (passwordNueva.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (passwordNueva !== confirmacion) {
      setError("Las dos contraseñas no coinciden.");
      return;
    }
    setGuardando(true);
    try {
      await authApi.restablecerPassword(token, passwordNueva);
      setListo(true);
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          "No se pudo restablecer la contraseña. Intenta de nuevo."
      );
    } finally {
      setGuardando(false);
    }
  };

  if (!token) {
    return (
      <div className="login-screen">
        <div className="login-card stack">
          <p>Este link no es válido. Pide uno nuevo desde la pantalla de inicio de sesión.</p>
          <button className="btn btn--primary" onClick={() => navigate("/login")}>
            Ir a inicio de sesión
          </button>
        </div>
      </div>
    );
  }

  if (listo) {
    return (
      <div className="login-screen">
        <div className="login-card stack">
          <p>Tu contraseña quedó actualizada.</p>
          <button className="btn btn--primary" onClick={() => navigate("/login")}>
            Ir a inicio de sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-screen">
      <form className="login-card stack" onSubmit={handleSubmit}>
        <div>
          <h1 style={{ fontSize: "1.3rem" }}>Pon una contraseña nueva</h1>
        </div>

        <label className="stack" style={{ gap: 4 }}>
          <span style={{ fontSize: "0.85rem" }}>Contraseña nueva</span>
          <input
            className="input"
            type="password"
            value={passwordNueva}
            onChange={(e) => setPasswordNueva(e.target.value)}
            required
            autoFocus
          />
        </label>

        <label className="stack" style={{ gap: 4 }}>
          <span style={{ fontSize: "0.85rem" }}>Confirma la contraseña</span>
          <input
            className="input"
            type="password"
            value={confirmacion}
            onChange={(e) => setConfirmacion(e.target.value)}
            required
          />
        </label>

        {error && <p className="error-text">{error}</p>}

        <button className="btn btn--primary" type="submit" disabled={guardando}>
          {guardando ? "Guardando..." : "Guardar contraseña"}
        </button>
      </form>
    </div>
  );
}

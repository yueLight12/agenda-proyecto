import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// Destino al que app/routers/saml_sso.py::acs redirige el navegador tras
// validar la respuesta del IdP (Okta) -- toma el token que ya viene en la
// URL, lo guarda (mismo mecanismo que el login normal, ver
// AuthContext.jsx::iniciarSesionConToken) y manda a la pantalla principal.
export default function SsoCallback() {
  const [parametros] = useSearchParams();
  const { iniciarSesionConToken } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    const token = parametros.get("token");
    if (!token) {
      setError("Falta el token de la sesión -- intenta entrar de nuevo.");
      return;
    }
    iniciarSesionConToken(token)
      .then(() => navigate("/"))
      .catch(() => setError("No se pudo completar el inicio de sesión."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="login-screen">
      <div className="login-card stack">
        {error ? (
          <>
            <p className="error-text">{error}</p>
            <a href="/login">Volver al login</a>
          </>
        ) : (
          <p style={{ color: "var(--color-text-muted)" }}>Completando inicio de sesión...</p>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { authApi } from "../api/endpoints";
import { useAuth } from "../context/AuthContext";

// Destino al que app/routers/saml_sso.py::acs redirige el navegador tras
// validar la respuesta del IdP (Okta) -- la URL trae un TICKET de un solo
// uso, no el JWT completo (2026-09-19, hallazgo de seguridad: el token
// quedaba horas en el historial del navegador en esta misma URL). Aquí se
// canjea ese ticket por el access_token real (POST /auth/ticket/canjear,
// nunca en una URL) y de ahí en adelante es el mismo mecanismo del login
// normal (ver AuthContext.jsx::iniciarSesionConToken).
export default function SsoCallback() {
  const [parametros] = useSearchParams();
  const { iniciarSesionConToken } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    const ticket = parametros.get("ticket");
    if (!ticket) {
      setError("Falta el ticket de la sesión -- intenta entrar de nuevo.");
      return;
    }
    authApi
      .canjearTicket(ticket)
      .then(({ access_token }) => iniciarSesionConToken(access_token))
      // replace: true (2026-09-19) -- que esta URL con el ticket ya usado
      // no se quede en el historial ni sea alcanzable con "atrás".
      .then(() => navigate("/", { replace: true }))
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

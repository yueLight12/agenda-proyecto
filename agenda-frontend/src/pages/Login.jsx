import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { authApi } from "../api/endpoints";
import { useAuth } from "../context/AuthContext";

// "¿Olvidaste tu contraseña?" (2026-09-23, a petición de Yue: "algo
// rápido que no requiera mucho trabajo") -- modal chico, sin ruta propia,
// que solo pide el correo y llama a /auth/olvide-password. SIEMPRE
// muestra el mismo mensaje de éxito, exista o no ese correo (mismo
// criterio de discreción del backend) -- así no revela qué correos están
// registrados.
function ModalOlvidePassword({ onCerrar }) {
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setEnviando(true);
    try {
      await authApi.olvidePassword(email);
      setEnviado(true);
    } catch {
      setError("No se pudo enviar el correo. Intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
      onClick={onCerrar}
    >
      <div
        className="card stack"
        style={{ gap: 12, padding: 20, maxWidth: 340, width: "90%" }}
        onClick={(e) => e.stopPropagation()}
      >
        {enviado ? (
          <>
            <p style={{ margin: 0 }}>
              Si ese correo está registrado, te llegó un link para poner una
              contraseña nueva. Revisa tu bandeja (y spam).
            </p>
            <button type="button" className="btn btn--primary" onClick={onCerrar}>
              Cerrar
            </button>
          </>
        ) : (
          <form className="stack" style={{ gap: 12 }} onSubmit={handleSubmit}>
            <p style={{ margin: 0, fontWeight: 600 }}>Recuperar contraseña</p>
            <label className="stack" style={{ gap: 4 }}>
              <span style={{ fontSize: "0.85rem" }}>Correo</span>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </label>
            {error && <p className="error-text">{error}</p>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="btn btn--ghost" onClick={onCerrar}>
                Cancelar
              </button>
              <button className="btn btn--primary" type="submit" disabled={enviando}>
                {enviando ? "Enviando..." : "Enviar link"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// Login corporativo (SSO/SAML, 2026-09-15) -- oculto por default
// (VITE_SSO_HABILITADO sin definir o distinto de "true") mientras no esté
// realmente conectado del lado del IdP; ver app/routers/saml_sso.py. Solo
// cambia si alguien enciende esa variable a propósito -- nadie del piloto
// ve nada nuevo hasta entonces.
const SSO_HABILITADO = import.meta.env.VITE_SSO_HABILITADO === "true";
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const [mostrarOlvidePassword, setMostrarOlvidePassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setCargando(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 403) {
        setError("Email o contraseña incorrectos.");
      } else {
        setError("No se pudo conectar con el servidor. Intenta de nuevo.");
      }
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="login-screen">
      <form className="login-card stack" onSubmit={handleSubmit}>
        <div>
          <h1 style={{ fontSize: "1.3rem" }}>Mi Chamba</h1>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem", margin: 0 }}>
            Inicia sesión para ver tus proyectos
          </p>
        </div>

        <label className="stack" style={{ gap: 4 }}>
          <span style={{ fontSize: "0.85rem" }}>Correo</span>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>

        <label className="stack" style={{ gap: 4 }}>
          <span style={{ fontSize: "0.85rem" }}>Contraseña</span>
          <div style={{ position: "relative" }}>
            <input
              className="input"
              type={mostrarPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ paddingRight: 60, width: "100%" }}
              required
            />
            <button
              type="button"
              onClick={() => setMostrarPassword((v) => !v)}
              style={{
                position: "absolute",
                right: 8,
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: "0.8rem",
                color: "var(--color-text-muted)",
              }}
            >
              {mostrarPassword ? "Ocultar" : "Ver"}
            </button>
          </div>
        </label>

        {error && <p className="error-text">{error}</p>}

        <button className="btn btn--primary" type="submit" disabled={cargando}>
          {cargando ? "Entrando..." : "Entrar"}
        </button>

        {/* "¿Olvidaste tu contraseña?" oculto por ahora (2026-09-23, a
            petición de Yue) -- el SMTP de Gmail está fallando por un
            bloqueo de red de esta máquina/red (timeout al conectar a
            smtp.gmail.com, confirmado con una prueba directa de
            enviar_correo, no es un bug del código), así que el link nunca
            llegaría. El backend (/auth/olvide-password,
            /auth/restablecer-password) y esta pantalla se quedan tal cual,
            solo no se muestra el botón. Para reactivarlo, quitar el
            `false &&` de abajo. */}
        {false && (
          <button
            type="button"
            className="btn btn--ghost"
            style={{ fontSize: "0.8rem" }}
            onClick={() => setMostrarOlvidePassword(true)}
          >
            ¿Olvidaste tu contraseña?
          </button>
        )}

        {SSO_HABILITADO && (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              window.location.href = `${API_URL}/saml/login`;
            }}
          >
            Entrar con mi trabajo
          </button>
        )}
      </form>

      {mostrarOlvidePassword && (
        <ModalOlvidePassword onCerrar={() => setMostrarOlvidePassword(false)} />
      )}
    </div>
  );
}

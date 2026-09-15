import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

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
      </form>
    </div>
  );
}

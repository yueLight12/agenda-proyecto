import { useState } from "react";
import { authApi } from "../api/endpoints";
import Modal from "./Modal";

export default function ModalCambiarPassword({ onCerrar }) {
  const [passwordActual, setPasswordActual] = useState("");
  const [passwordNueva, setPasswordNueva] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [error, setError] = useState("");
  const [exito, setExito] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (passwordNueva !== confirmacion) {
      setError("La nueva contraseña y su confirmación no coinciden.");
      return;
    }

    setGuardando(true);
    try {
      await authApi.cambiarPassword(passwordActual, passwordNueva);
      setExito(true);
      setPasswordActual("");
      setPasswordNueva("");
      setConfirmacion("");
    } catch (err) {
      setError(err.response?.data?.detail || "No se pudo cambiar la contraseña.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal titulo="Cambiar contraseña" onCerrar={onCerrar}>
      <form className="stack" onSubmit={handleSubmit}>
        <label className="stack" style={{ gap: 4 }}>
          <span style={{ fontSize: "0.85rem" }}>Contraseña actual</span>
          <input
            className="input"
            type="password"
            value={passwordActual}
            onChange={(e) => setPasswordActual(e.target.value)}
            required
          />
        </label>

        <label className="stack" style={{ gap: 4 }}>
          <span style={{ fontSize: "0.85rem" }}>Nueva contraseña</span>
          <input
            className="input"
            type="password"
            value={passwordNueva}
            onChange={(e) => setPasswordNueva(e.target.value)}
            minLength={8}
            required
          />
        </label>

        <label className="stack" style={{ gap: 4 }}>
          <span style={{ fontSize: "0.85rem" }}>Confirmar nueva contraseña</span>
          <input
            className="input"
            type="password"
            value={confirmacion}
            onChange={(e) => setConfirmacion(e.target.value)}
            minLength={8}
            required
          />
        </label>

        {error && <p className="error-text">{error}</p>}
        {exito && <p style={{ color: "var(--color-success)" }}>Contraseña actualizada correctamente.</p>}

        <button className="btn btn--primary" type="submit" disabled={guardando}>
          {guardando ? "Guardando..." : "Guardar"}
        </button>
      </form>
    </Modal>
  );
}

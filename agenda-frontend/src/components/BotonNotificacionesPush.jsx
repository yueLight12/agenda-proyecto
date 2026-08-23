import { useEffect, useState } from "react";
import { activarNotificacionesPush, estadoNotificacionesPush, pushSoportado } from "../push/pushClient";

// Botón de activar notificaciones push del navegador (2026-08-23, a
// petición de Yue: los entregables urgentes deben poder avisar aunque la
// app esté cerrada o el celular con la pantalla apagada). Se oculta solo
// si el navegador no soporta Web Push (ej. Safari fuera de "agregar a
// pantalla de inicio") o si el usuario ya negó el permiso -- en ese caso
// no hay nada que este botón pueda hacer, hay que cambiarlo desde los
// ajustes del navegador.
export default function BotonNotificacionesPush() {
  const [estado, setEstado] = useState("cargando"); // cargando | inactivo | activo | denegado | no-soportado
  const [error, setError] = useState("");

  useEffect(() => {
    if (!pushSoportado()) {
      setEstado("no-soportado");
      return;
    }
    estadoNotificacionesPush().then(setEstado);
  }, []);

  if (estado === "cargando" || estado === "no-soportado" || estado === "activo") {
    return null;
  }

  const activar = async () => {
    setError("");
    const resultado = await activarNotificacionesPush();
    if (resultado.ok) {
      setEstado("activo");
    } else {
      setError(resultado.motivo);
      setEstado(await estadoNotificacionesPush());
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {estado === "denegado" ? (
        <span
          style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}
          title="Actívalas desde los ajustes de notificaciones del navegador"
        >
          Notificaciones bloqueadas
        </span>
      ) : (
        <button type="button" className="btn btn--ghost" onClick={activar} title="Recibir avisos de tareas urgentes aunque la app esté cerrada">
          🔔 Activar avisos
        </button>
      )}
      {error && <span style={{ fontSize: "0.75rem", color: "var(--color-danger, #c0392b)" }}>{error}</span>}
    </div>
  );
}

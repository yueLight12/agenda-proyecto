import { useEffect, useRef } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

// Tiempo real (2026-08-21, a petición de Yue: "que se refleje de
// inmediato si alguien asigna algo o marca algo como completado") vía
// Server-Sent Events -- ver app/services/eventos_tiempo_real.py en el
// backend para el diseño completo (un solo hook de SQLAlchemy dispara el
// evento para CUALQUIER Notificacion nueva, sin importar de qué acción
// vino). Este hook del frontend solo abre la conexión y llama
// `alRecibirEvento` en cada mensaje -- quien lo usa decide qué hacer
// (normalmente, disparar el mismo refetch que ya usaba por polling).
export function useEventosTiempoReal(alRecibirEvento) {
  const callbackRef = useRef(alRecibirEvento);
  callbackRef.current = alRecibirEvento;

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) return undefined;

    const fuente = new EventSource(
      `${API_URL}/eventos/stream?token=${encodeURIComponent(token)}`
    );
    fuente.onmessage = (mensaje) => {
      try {
        const datos = JSON.parse(mensaje.data);
        callbackRef.current?.(datos);
      } catch {
        // Ignorado a propósito -- un mensaje con formato inesperado no
        // debe romper el resto de la app.
      }
    };
    // EventSource reconecta solo si la conexión se corta (comportamiento
    // nativo del navegador) -- no hace falta lógica de retry propia.
    return () => fuente.close();
  }, []);
}

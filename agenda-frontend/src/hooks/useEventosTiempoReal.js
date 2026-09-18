import { useEffect, useRef } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

// Tiempo real (2026-08-21, a petición de Yue: "que se refleje de
// inmediato si alguien asigna algo o marca algo como completado") vía
// Server-Sent Events -- ver app/services/eventos_tiempo_real.py en el
// backend para el diseño completo.
//
// UNA sola conexión EventSource compartida por navegador (2026-09-19,
// corrigiendo un bug real de rendimiento) -- hasta el 2026-09-18 este hook
// abría su PROPIA conexión por cada componente que lo llamaba; al agregarlo
// a Calendario/Mi semana/Mis proyectos/Rendimiento/tablero de proyecto en
// la misma sesión ("que todo sea instantáneo"), una sola pantalla llegaba a
// abrir 4-6 conexiones SSE simultáneas, y cada conexión nueva disparaba una
// consulta de autenticación en el backend (ver el fix de
// run_in_threadpool en eventos_tiempo_real.py) -- entre más pantallas/
// usuarios reales, más lenta se sentía la app entera. Ahora se abre UNA
// sola conexión (module-level, fuera de React) la primera vez que algún
// componente se suscribe, y se cierra cuando el último se desmonta; todos
// los suscriptores reciben el mismo evento.
let fuenteCompartida = null;
let suscriptores = new Set();

function asegurarConexion() {
  if (fuenteCompartida) return;
  const token = localStorage.getItem("access_token");
  if (!token) return;

  fuenteCompartida = new EventSource(
    `${API_URL}/eventos/stream?token=${encodeURIComponent(token)}`
  );
  fuenteCompartida.onmessage = (mensaje) => {
    let datos;
    try {
      datos = JSON.parse(mensaje.data);
    } catch {
      // Ignorado a propósito -- un mensaje con formato inesperado no
      // debe romper el resto de la app.
      return;
    }
    suscriptores.forEach((cb) => cb(datos));
  };
}

function cerrarConexionSiQuedaVacia() {
  if (suscriptores.size === 0 && fuenteCompartida) {
    fuenteCompartida.close();
    fuenteCompartida = null;
  }
}

export function useEventosTiempoReal(alRecibirEvento) {
  const callbackRef = useRef(alRecibirEvento);
  callbackRef.current = alRecibirEvento;

  useEffect(() => {
    const wrapper = (datos) => callbackRef.current?.(datos);
    suscriptores.add(wrapper);
    asegurarConexion();
    return () => {
      suscriptores.delete(wrapper);
      cerrarConexionSiQuedaVacia();
    };
  }, []);
}

import { useEffect, useRef } from "react";
import { authApi } from "../api/endpoints";

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
let conectando = false;

// La URL de EventSource ya no lleva el JWT completo (2026-09-19, hallazgo
// de seguridad: quedaba en logs de acceso del servidor/devtunnel al viajar
// tal cual en el query string) -- primero se pide un ticket de un solo uso
// vía POST /auth/ticket (autenticado normal, por header, nunca en una URL)
// y ESE es el que se manda a /eventos/stream. Ver
// app/services/tickets_temporales.py en el backend.
async function asegurarConexion() {
  if (fuenteCompartida || conectando) return;
  const token = localStorage.getItem("access_token");
  if (!token) return;

  conectando = true;
  let ticket;
  try {
    ticket = await authApi.pedirTicket();
  } catch {
    conectando = false;
    return;
  }
  conectando = false;

  // Pudo haberse desuscrito el último componente mientras se pedía el
  // ticket -- no abrir una conexión que nadie va a usar.
  if (suscriptores.size === 0) return;

  fuenteCompartida = new EventSource(
    `${API_URL}/eventos/stream?ticket=${encodeURIComponent(ticket)}`
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

import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export const api = axios.create({
  baseURL: API_URL,
  // 30s (2026-08-31, antes 15s) -- en producción (API y DB en la misma red
  // Docker de la Pi) nunca se acerca a este límite; el margen extra existe
  // por el entorno de desarrollo local, donde el backend habla con la DB
  // real a través de un túnel SSH con latencia alta y /dashboard/resumen
  // puede tardar ~20s (ver CLAUDE.md, entorno de desarrollo local).
  timeout: 30000,
});

// Adjunta el token JWT guardado en localStorage a cada request (si existe)
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Si el backend responde 401, el token ya no es válido: forzamos logout
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem("access_token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

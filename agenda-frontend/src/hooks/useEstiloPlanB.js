import { useEffect } from "react";

// El cliente decidió quedarse únicamente con el estilo "grafito" para
// Agenda Plan B (2026-08-21) -- ya no hay alternancia entre estilos. Este
// hook solo fija el atributo [data-estilo-planb="grafito"] en <html>
// mientras la pantalla de Agenda Plan B esté montada, y lo quita al
// desmontar (para que otras pantallas, ej. AppLayout, nunca lo vean). Se
// aplica en <html> (no en el contenedor .planb) porque los modales de
// Agenda Plan B usan un portal a document.body (ver Modal.jsx) y quedan
// fuera del árbol de .planb -- con el atributo en <html>, el CSS de
// app.css puede alcanzar también al modal.
export function useEstiloPlanB() {
  useEffect(() => {
    document.documentElement.setAttribute("data-estilo-planb", "grafito");
    return () => document.documentElement.removeAttribute("data-estilo-planb");
  }, []);
}

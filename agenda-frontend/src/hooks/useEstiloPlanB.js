import { useEffect, useState } from "react";

const CLAVE_ESTILO = "planb_estilo";

// Estilos disponibles hoy -- se puede seguir agregando aquí (ej. "indigo"
// cuando esté listo) sin tocar el resto del hook. El selector de la
// topbar (AgendaPlanB.jsx) recorre esta misma lista, así que agregar un
// estilo nuevo aquí ya lo hace aparecer ahí también.
export const ESTILOS_PLANB = [
  { valor: "clasico", etiqueta: "Clásico" },
  { valor: "grafito", etiqueta: "Grafito" },
  { valor: "navy", etiqueta: "Navy" },
];

// Reactivado 2026-08-25 a petición de Yue -- el 2026-08-21 se había fijado
// "grafito" como único estilo sin selector (ver historial en app.css).
// Mismo patrón que useTema.js (claro/oscuro): la elección queda guardada
// por dispositivo (localStorage), "grafito" es el default porque era el
// que estaba activo antes de reactivar esto. Se aplica el atributo en
// <html> (no en el contenedor .planb) porque los modales de Agenda Plan B
// usan un portal a document.body (ver Modal.jsx) y quedan fuera del árbol
// de .planb -- con el atributo en <html>, el CSS de app.css puede
// alcanzar también al modal. Se limpia al desmontar para que otras
// pantallas (AppLayout, etc.) nunca lo vean.
export function useEstiloPlanB() {
  const [estilo, setEstiloState] = useState(
    () => localStorage.getItem(CLAVE_ESTILO) || "grafito"
  );

  useEffect(() => {
    document.documentElement.setAttribute("data-estilo-planb", estilo);
    return () => document.documentElement.removeAttribute("data-estilo-planb");
  }, [estilo]);

  const seleccionarEstilo = (nuevo) => {
    localStorage.setItem(CLAVE_ESTILO, nuevo);
    setEstiloState(nuevo);
  };

  return { estilo, seleccionarEstilo };
}

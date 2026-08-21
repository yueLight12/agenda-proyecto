import { useEffect, useState } from "react";

const CLAVE_ESTILO = "planb_estilo";

// Mismo patron que useTema.js (claro/oscuro), pero sin sincronizar contra
// ninguna preferencia del sistema -- "clasico" es el default hasta que el
// usuario elige "nuevo" a proposito, y esa eleccion queda guardada por
// dispositivo (localStorage) para que cada quien pueda alternar sin
// afectar a los demas. Se aplica en <html> (no en el contenedor .planb)
// porque los modales de Agenda Plan B usan un portal a document.body
// (ver Modal.jsx) y quedan fuera del arbol de .planb -- con el atributo
// en <html>, el CSS de app.css puede alcanzar tambien al modal. Se limpia
// al desmontar para que otras pantallas (AppLayout, etc.) nunca lo vean.
export function useEstiloPlanB() {
  const [estilo, setEstilo] = useState(
    () => localStorage.getItem(CLAVE_ESTILO) || "clasico"
  );

  useEffect(() => {
    localStorage.setItem(CLAVE_ESTILO, estilo);
    document.documentElement.setAttribute("data-estilo-planb", estilo);
    return () => document.documentElement.removeAttribute("data-estilo-planb");
  }, [estilo]);

  const alternarEstilo = () => {
    setEstilo((actual) => (actual === "nuevo" ? "clasico" : "nuevo"));
  };

  return { estilo, alternarEstilo };
}

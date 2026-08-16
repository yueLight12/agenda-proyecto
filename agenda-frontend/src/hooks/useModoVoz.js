import { useState } from "react";

const CLAVE_MODO_VOZ = "modo_voz";

// Mismo patrón de preferencia persistida que useTema.js, pero sin
// equivalente de prefers-color-scheme: default encendido, para que el modo
// manos-libres esté disponible desde el inicio sin configurar nada.
export function useModoVoz() {
  const [modoVoz, setModoVoz] = useState(() => localStorage.getItem(CLAVE_MODO_VOZ) !== "off");

  const alternarModoVoz = () => {
    setModoVoz((actual) => {
      const nuevo = !actual;
      localStorage.setItem(CLAVE_MODO_VOZ, nuevo ? "on" : "off");
      return nuevo;
    });
  };

  return { modoVoz, alternarModoVoz };
}

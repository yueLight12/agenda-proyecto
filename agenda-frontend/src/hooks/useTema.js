import { useEffect, useState } from "react";

const CLAVE_TEMA = "tema";

const temaDelSistema = () =>
  window.matchMedia("(prefers-color-scheme: dark)").matches ? "oscuro" : "claro";

// El atributo data-theme ya se fija antes del primer paint por un script
// inline en index.html (evita parpadeo). Este hook sincroniza el estado de
// React con ese atributo y expone alternarTema() para el botón de la topbar.
// Mientras el usuario no haya elegido manualmente, el tema sigue en vivo al
// del sistema operativo; en cuanto toca el botón, esa elección queda
// guardada en localStorage y manda sobre el sistema de ahí en adelante.
export function useTema() {
  const [tema, setTema] = useState(() => localStorage.getItem(CLAVE_TEMA) || temaDelSistema());
  const [tieneOverride, setTieneOverride] = useState(() => localStorage.getItem(CLAVE_TEMA) !== null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", tema);
  }, [tema]);

  useEffect(() => {
    if (tieneOverride) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const escuchar = (e) => setTema(e.matches ? "oscuro" : "claro");
    media.addEventListener("change", escuchar);
    return () => media.removeEventListener("change", escuchar);
  }, [tieneOverride]);

  const alternarTema = () => {
    setTema((actual) => {
      const nuevo = actual === "oscuro" ? "claro" : "oscuro";
      localStorage.setItem(CLAVE_TEMA, nuevo);
      return nuevo;
    });
    setTieneOverride(true);
  };

  return { tema, alternarTema };
}

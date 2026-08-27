import { useEffect, useState } from "react";

// FAB del asistente de voz "perdido" al hacer zoom (2026-08-27, reportado
// por Yue: "tanto en la web como en el celular") -- position: fixed ancla
// el botón a la esquina del VIEWPORT DE LAYOUT (la página completa), pero
// al hacer zoom (sobre todo pinch-zoom en celular, y en algunos casos
// zoom de navegador en escritorio) el área VISIBLE real dejó de coincidir
// con esa esquina -- el botón sigue ahí, solo que fuera de lo que se ve
// sin hacer scroll (confirmado con Yue, no es que desaparezca ni que algo
// lo tape). window.visualViewport es la API pensada justo para esto:
// expone el área visible real (offset + tamaño), distinta del layout
// viewport cuando hay zoom/pan. Sin soporte (navegador viejo) simplemente
// no se aplica nada y el botón se queda con su posición CSS fija de
// siempre -- no hay regresión.
export function useFabAntizoom(margen = 16) {
  const [estilo, setEstilo] = useState(null);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;

    const reposicionar = () => {
      const derecha = window.innerWidth - (vv.offsetLeft + vv.width) + margen;
      const abajo = window.innerHeight - (vv.offsetTop + vv.height) + margen;
      setEstilo({
        right: `${Math.max(derecha, margen)}px`,
        bottom: `${Math.max(abajo, margen)}px`,
      });
    };

    reposicionar();
    vv.addEventListener("resize", reposicionar);
    vv.addEventListener("scroll", reposicionar);
    window.addEventListener("resize", reposicionar);
    return () => {
      vv.removeEventListener("resize", reposicionar);
      vv.removeEventListener("scroll", reposicionar);
      window.removeEventListener("resize", reposicionar);
    };
  }, [margen]);

  return estilo;
}

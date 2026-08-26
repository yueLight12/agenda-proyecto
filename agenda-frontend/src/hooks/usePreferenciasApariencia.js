import { useCallback, useEffect, useState } from "react";
import { preferenciasApi } from "../api/endpoints";

// Panel "Personalizar apariencia" (2026-08-26, a petición de Yue) -- fuente
// de verdad compartida de shape/cardOrder, consumida tanto por
// AppearanceSettings.jsx (para editarlas) como por AgendaPlanB.jsx (para
// aplicar el orden a TarjetasAsignar). El tema claro/oscuro NO vive aquí --
// sigue siendo useTema.js, ver justificación en AppearanceSettings.jsx.
//
// Mismo patrón de "mirror en localStorage antes del primer paint" que ya
// usa useTema.js (ver el script inline en index.html): como estas
// preferencias ahora viven en el backend (requieren estar autenticado), no
// se pueden leer de forma síncrona antes de montar React -- en vez de
// esperar el GET inicial (que sí tardaría en aplicarse y se notaría el
// "flash" del valor por defecto), el script inline en index.html aplica el
// último valor conocido en localStorage antes del primer paint, y este
// hook lo reconcilia con el backend en cuanto responde.
const RADIOS = { square: "4px", rounded: "12px", circle: "999px" };
export const ORDEN_DEFECTO_TARJETAS = ["tarea", "proyecto", "persona", "agenda", "rendimiento"];
const CLAVE_SHAPE = "apariencia_shape";
const CLAVE_CARD_ORDER = "apariencia_card_order";

function aplicarShape(shape) {
  document.documentElement.style.setProperty("--radius-shape", RADIOS[shape] || RADIOS.rounded);
}

function leerCardOrderGuardado() {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE_CARD_ORDER));
    if (Array.isArray(guardado) && guardado.length === ORDEN_DEFECTO_TARJETAS.length) {
      return guardado;
    }
  } catch {
    // localStorage corrupto o vacío -- se usa el orden por defecto.
  }
  return ORDEN_DEFECTO_TARJETAS;
}

export function usePreferenciasApariencia() {
  const [shape, setShape] = useState(() => localStorage.getItem(CLAVE_SHAPE) || "rounded");
  const [cardOrder, setCardOrder] = useState(leerCardOrderGuardado);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    aplicarShape(shape);
  }, [shape]);

  useEffect(() => {
    let activo = true;
    preferenciasApi
      .obtener()
      .then((datos) => {
        if (!activo) return;
        setShape(datos.shape);
        localStorage.setItem(CLAVE_SHAPE, datos.shape);
        if (Array.isArray(datos.card_order) && datos.card_order.length === ORDEN_DEFECTO_TARJETAS.length) {
          setCardOrder(datos.card_order);
          localStorage.setItem(CLAVE_CARD_ORDER, JSON.stringify(datos.card_order));
        }
      })
      .catch(() => {
        // Sin conexión o sesión vencida -- se queda con el mirror local /
        // los valores por defecto, sin romper el resto de la app.
      })
      .finally(() => {
        if (activo) setCargando(false);
      });
    return () => {
      activo = false;
    };
  }, []);

  const guardar = useCallback(async ({ shape: nuevaForma, cardOrder: nuevoOrden, theme }) => {
    const datos = await preferenciasApi.actualizar({
      shape: nuevaForma,
      card_order: nuevoOrden,
      theme,
    });
    setShape(datos.shape);
    localStorage.setItem(CLAVE_SHAPE, datos.shape);
    if (Array.isArray(datos.card_order)) {
      setCardOrder(datos.card_order);
      localStorage.setItem(CLAVE_CARD_ORDER, JSON.stringify(datos.card_order));
    }
    return datos;
  }, []);

  return { shape, cardOrder, cargando, guardar };
}

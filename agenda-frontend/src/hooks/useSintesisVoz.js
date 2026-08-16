import { useCallback, useEffect, useRef } from "react";
import { limpiarParaVoz } from "../utils/formatoAsistente";

const soportado = typeof window !== "undefined" && "speechSynthesis" in window;

const elegirVoz = () => {
  const voces = window.speechSynthesis.getVoices();
  return (
    voces.find((v) => v.lang?.toLowerCase() === "es-mx") ||
    voces.find((v) => v.lang?.toLowerCase().startsWith("es")) ||
    null
  );
};

/**
 * Wrapper sobre window.speechSynthesis (texto-a-voz del navegador, sin
 * infraestructura nueva). Si el navegador no lo soporta, hablar() no falla:
 * llama onFin igual (async) para que el resto del flujo — incluido el
 * auto-listen manos-libres — siga funcionando sin voz.
 */
export default function useSintesisVoz() {
  const suprimirCallbackRef = useRef(false);
  // Chrome (sobre todo Android) tiene un bug real y muy documentado: si el
  // SpeechSynthesisUtterance no se referencia desde ningún lado más que la
  // variable local de la función, el recolector de basura a veces lo destruye
  // A MEDIO HABLAR (o antes de arrancar), y el audio simplemente no se
  // escucha, sin ningún error — este ref lo mantiene vivo mientras dura.
  const utteranceActualRef = useRef(null);
  // Otro bug real de Chrome: llamar speak() INMEDIATAMENTE después de
  // cancel() a veces se pierde en silencio (carrera interna del navegador,
  // muy reportada) — hablar() siempre cancela primero (incluso la primera
  // vez, cuando no hay nada que cancelar), así que sin un margen entre
  // ambos, la voz podía no sonar NUNCA, no solo en llamadas repetidas. El
  // token invalida un speak() pendiente si se pide hablar otra cosa antes
  // de que llegue a ejecutarse.
  const tokenRef = useRef(0);

  useEffect(() => {
    if (!soportado) return;
    // Chrome/Firefox cargan las voces de forma asíncrona la primera vez.
    window.speechSynthesis.getVoices();
    const recargar = () => window.speechSynthesis.getVoices();
    window.speechSynthesis.addEventListener("voiceschanged", recargar);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", recargar);
      window.speechSynthesis.cancel();
    };
  }, []);

  const hablar = useCallback((textoOriginal, { onFin, onError } = {}) => {
    const texto = limpiarParaVoz(textoOriginal);
    tokenRef.current += 1;
    const miToken = tokenRef.current;

    if (!texto) {
      onFin?.();
      return;
    }
    if (!soportado) {
      setTimeout(() => onFin?.(), 0);
      return;
    }

    suprimirCallbackRef.current = false;
    window.speechSynthesis.cancel();

    setTimeout(() => {
      if (tokenRef.current !== miToken) return; // se pidió hablar otra cosa mientras esperábamos

      const utterance = new SpeechSynthesisUtterance(texto);
      utterance.lang = "es-MX";
      const voz = elegirVoz();
      if (voz) utterance.voice = voz;

      utterance.onend = () => {
        if (utteranceActualRef.current === utterance) utteranceActualRef.current = null;
        if (suprimirCallbackRef.current) return;
        onFin?.();
      };
      utterance.onerror = (e) => {
        if (utteranceActualRef.current === utterance) utteranceActualRef.current = null;
        if (suprimirCallbackRef.current) return;
        if (e.error === "canceled" || e.error === "interrupted") return;
        onError?.(e);
        onFin?.();
      };

      utteranceActualRef.current = utterance;
      window.speechSynthesis.resume();
      window.speechSynthesis.speak(utterance);
    }, 150);
  }, []);

  const detener = useCallback(() => {
    if (!soportado) return;
    tokenRef.current += 1; // invalida cualquier speak() pendiente en su setTimeout
    suprimirCallbackRef.current = true;
    window.speechSynthesis.cancel();
  }, []);

  // Truco estándar para "desbloquear" speechSynthesis en Chrome/Safari
  // móvil: el primer speak() debe ocurrir dentro de un gesto de usuario
  // síncrono (clic), no después de una espera async — se llama una sola vez
  // en el primer clic real del usuario, con un utterance vacío/silencioso.
  const desbloquear = useCallback(() => {
    if (!soportado) return;
    const utterance = new SpeechSynthesisUtterance(" ");
    utterance.volume = 0;
    window.speechSynthesis.speak(utterance);
  }, []);

  return { soportado, hablar, detener, desbloquear };
}

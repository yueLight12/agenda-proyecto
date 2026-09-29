import { useCallback, useRef } from "react";
import { asistenteApi } from "../api/endpoints";
import { limpiarParaVoz } from "../utils/formatoAsistente";
import useSintesisVoz from "./useSintesisVoz";
import { VOZ_ASISTENTE_DEFECTO } from "./usePreferenciasApariencia";

/**
 * Fase 4 del plan de fluidez de Chambeador (2026-09-28) -- voz neuronal
 * (Piper, vía el backend) en vez de SpeechSynthesisUtterance del navegador.
 * Misma interfaz que useSintesisVoz.js ({ soportado, hablar, detener,
 * desbloquear }) para que ModalAsistenteVoz.jsx cambie lo mínimo.
 *
 * Si el backend no tiene la voz neuronal configurada (PIPER_VOCES_DIR
 * vacío -- ej. el servidor real, que todavía no la tiene mientras esto se
 * prueba en local) o falla por cualquier otra razón (sin red, timeout),
 * cae automáticamente a useSintesisVoz (voz nativa del navegador) -- nunca
 * se queda sin voz por un problema de infraestructura.
 */
export default function useSintesisVozNeural(voz = VOZ_ASISTENTE_DEFECTO) {
  const navegador = useSintesisVoz();
  const audioActualRef = useRef(null);
  const tokenRef = useRef(0);

  const detener = useCallback(() => {
    tokenRef.current += 1;
    if (audioActualRef.current) {
      audioActualRef.current.pause();
      audioActualRef.current = null;
    }
    navegador.detener();
  }, [navegador]);

  const hablar = useCallback(
    async (textoOriginal, { onFin, onError } = {}) => {
      const texto = limpiarParaVoz(textoOriginal);
      tokenRef.current += 1;
      const miToken = tokenRef.current;

      // Bug real reportado por Yue (2026-09-29): a diferencia de la voz del
      // navegador (que useSintesisVoz.js siempre cancelaba antes de hablar
      // algo nuevo), esta versión nunca detenía el audio que ya estaba
      // sonando -- si el asistente terminaba de procesar mientras todavía
      // se escuchaba "Escuché: ..." del relleno de silencio, las dos voces
      // se oían encimadas. Se detiene cualquier audio en curso (propio o
      // el de respaldo del navegador) antes de pedir/reproducir el nuevo.
      if (audioActualRef.current) {
        audioActualRef.current.pause();
        audioActualRef.current = null;
      }
      navegador.detener();

      if (!texto) {
        onFin?.();
        return;
      }

      try {
        const blob = await asistenteApi.sintetizarVoz({ texto, voz });
        if (tokenRef.current !== miToken) return; // se pidió hablar otra cosa mientras esperábamos

        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioActualRef.current = audio;
        audio.onended = () => {
          URL.revokeObjectURL(url);
          if (audioActualRef.current === audio) audioActualRef.current = null;
          if (tokenRef.current !== miToken) return;
          onFin?.();
        };
        audio.onerror = (e) => {
          URL.revokeObjectURL(url);
          if (audioActualRef.current === audio) audioActualRef.current = null;
          if (tokenRef.current !== miToken) return;
          onError?.(e);
          onFin?.();
        };
        await audio.play();
      } catch {
        // Sin voz neuronal disponible (503 no configurada, sin red, etc.)
        // -- cae a la voz nativa del navegador, misma llamada que antes.
        if (tokenRef.current !== miToken) return;
        navegador.hablar(textoOriginal, { onFin, onError });
      }
    },
    [voz, navegador]
  );

  return { soportado: true, hablar, detener, desbloquear: navegador.desbloquear };
}

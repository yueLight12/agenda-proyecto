import { useCallback, useRef, useState } from "react";

const DURACION_MAXIMA_MS = 30000;

// Detección automática de silencio (2026-09-04, a petición de Yue: no
// quería tener que darle "Detener" a mano cada vez que terminaba de
// hablar) -- mide el volumen del micrófono en tiempo real con la Web
// Audio API y detiene la grabación sola tras un tramo de silencio
// sostenido, una vez que ya se detectó algo de voz. No reemplaza el tope
// de DURACION_MAXIMA_MS (sigue como respaldo si algo falla o el usuario
// no dice nada).
const UMBRAL_VOZ = 0.02; // nivel RMS (0-1) por encima del cual se considera que hay voz
const SILENCIO_PARA_DETENER_MS = 1400; // silencio sostenido tras haber hablado, para detener solo
const INTERVALO_ANALISIS_MS = 100;

/**
 * Graba audio del micrófono con MediaRecorder. Solo captura el audio — la
 * transcripción real la hace Whisper en el backend (ver asistenteApi).
 */
export default function useGrabadorAudio() {
  const [estado, setEstado] = useState("inactivo"); // inactivo | grabando
  const [error, setError] = useState("");
  const mediaRecorderRef = useRef(null);
  const fragmentosRef = useRef([]);
  const streamRef = useRef(null);
  const timeoutRef = useRef(null);
  const audioContextRef = useRef(null);
  const intervaloAnalisisRef = useRef(null);

  const limpiarAnalisisVolumen = useCallback(() => {
    if (intervaloAnalisisRef.current) {
      clearInterval(intervaloAnalisisRef.current);
      intervaloAnalisisRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  }, []);

  const detener = useCallback(() => {
    limpiarAnalisisVolumen();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, [limpiarAnalisisVolumen]);

  // Analiza el volumen del stream y llama a `detener` sola tras
  // SILENCIO_PARA_DETENER_MS de silencio, una vez que ya hubo voz --
  // evita cortar antes de tiempo si el usuario tarda un poco en arrancar
  // a hablar. Si la Web Audio API no está disponible, simplemente no se
  // arma (queda el tope de 30s / botón manual como única salida, sin
  // regresión respecto al comportamiento anterior).
  const armarDeteccionSilencio = useCallback(
    (stream) => {
      const AudioContextAPI = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextAPI) return;
      try {
        const audioContext = new AudioContextAPI();
        const fuente = audioContext.createMediaStreamSource(stream);
        const analizador = audioContext.createAnalyser();
        analizador.fftSize = 512;
        fuente.connect(analizador);
        audioContextRef.current = audioContext;

        const datos = new Uint8Array(analizador.fftSize);
        let yaDetectoVoz = false;
        let silencioDesde = null;

        intervaloAnalisisRef.current = setInterval(() => {
          analizador.getByteTimeDomainData(datos);
          let sumaCuadrados = 0;
          for (let i = 0; i < datos.length; i++) {
            const muestra = (datos[i] - 128) / 128;
            sumaCuadrados += muestra * muestra;
          }
          const rms = Math.sqrt(sumaCuadrados / datos.length);

          if (rms > UMBRAL_VOZ) {
            yaDetectoVoz = true;
            silencioDesde = null;
            return;
          }
          if (!yaDetectoVoz) return; // silencio inicial, antes de que hable -- no cuenta
          if (silencioDesde === null) {
            silencioDesde = Date.now();
            return;
          }
          if (Date.now() - silencioDesde >= SILENCIO_PARA_DETENER_MS) {
            detener();
          }
        }, INTERVALO_ANALISIS_MS);
      } catch {
        // Sin soporte real (navegador viejo, o el AudioContext falla) --
        // se ignora, queda el tope de 30s / botón manual de siempre.
      }
    },
    [detener]
  );

  const iniciar = useCallback(() => {
    setError("");
    return new Promise((resolve, reject) => {
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          streamRef.current = stream;
          const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
          fragmentosRef.current = [];

          recorder.ondataavailable = (e) => {
            if (e.data.size > 0) fragmentosRef.current.push(e.data);
          };
          recorder.onstop = () => {
            limpiarAnalisisVolumen();
            stream.getTracks().forEach((t) => t.stop());
            setEstado("inactivo");
            const blob = new Blob(fragmentosRef.current, { type: "audio/webm" });
            resolve(blob);
          };

          mediaRecorderRef.current = recorder;
          recorder.start();
          setEstado("grabando");
          timeoutRef.current = setTimeout(detener, DURACION_MAXIMA_MS);
          armarDeteccionSilencio(stream);
        })
        .catch(() => {
          setError("No se pudo acceder al micrófono. Revisa los permisos del navegador.");
          reject(new Error("sin_permiso_microfono"));
        });
    });
  }, [detener, armarDeteccionSilencio, limpiarAnalisisVolumen]);

  return { estado, error, iniciar, detener };
}

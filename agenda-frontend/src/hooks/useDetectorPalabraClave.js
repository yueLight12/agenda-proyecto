import { useCallback, useEffect, useRef, useState } from "react";

// Detector de "chambeador" (2026-09-04, a petición de Yue) -- escucha
// continuamente con el reconocimiento de voz NATIVO del navegador
// (SpeechRecognition), gratis y sin pasar por el backend de Whisper, solo
// para detectar la palabra clave. En cuanto la detecta, se detiene a sí
// mismo (no puede haber dos procesos de reconocimiento activos al mismo
// tiempo) y avisa a quien lo use para que abra el asistente de verdad.
//
// Coincide con "chambeador" como substring del texto reconocido, así que
// "hola chambeador", "oye chambeador" y "chambeador" solo, todas disparan
// igual -- no hace falta una frase exacta.
//
// Soporte de navegador (2026-09-04, confirmado con Yue antes de construir
// esto): funciona en Chrome (escritorio y Android). NO funciona en
// Firefox, y es parcial en Safari/iOS -- `soportado` refleja esto, quien
// use el hook debe ocultar el control si es false.
const PALABRA_CLAVE = "chambeador";

function normalizar(texto) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function useDetectorPalabraClave(onDetectado) {
  const [activo, setActivo] = useState(false);
  const reconocedorRef = useRef(null);
  const activoRef = useRef(false);
  const onDetectadoRef = useRef(onDetectado);
  onDetectadoRef.current = onDetectado;

  const ReconocimientoAPI =
    typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const soportado = Boolean(ReconocimientoAPI);

  const detener = useCallback(() => {
    activoRef.current = false;
    setActivo(false);
    if (reconocedorRef.current) {
      reconocedorRef.current.onend = null; // evita que el auto-reinicio dispare tras un stop() manual
      reconocedorRef.current.stop();
      reconocedorRef.current = null;
    }
  }, []);

  const iniciar = useCallback(() => {
    if (!soportado || activoRef.current) return;

    const reconocedor = new ReconocimientoAPI();
    reconocedor.lang = "es-MX";
    reconocedor.continuous = true;
    reconocedor.interimResults = true;

    reconocedor.onresult = (evento) => {
      for (let i = evento.resultIndex; i < evento.results.length; i++) {
        const texto = normalizar(evento.results[i][0].transcript);
        if (texto.includes(PALABRA_CLAVE)) {
          detener();
          onDetectadoRef.current();
          return;
        }
      }
    };
    // "no-speech"/"aborted" son normales en escucha continua de silencio
    // prolongado -- no son un error real, se ignoran; onend ya reinicia
    // solo si sigue "activo".
    reconocedor.onerror = () => {};
    reconocedor.onend = () => {
      if (activoRef.current) {
        try {
          reconocedor.start();
        } catch {
          // Ya estaba corriendo (algunos navegadores disparan onend/start
          // casi al mismo tiempo) -- se ignora, el siguiente ciclo lo
          // resuelve solo.
        }
      }
    };

    reconocedorRef.current = reconocedor;
    activoRef.current = true;
    setActivo(true);
    try {
      reconocedor.start();
    } catch {
      // Permiso de micrófono denegado/bloqueado, o el navegador rechaza el
      // arranque en este momento (2026-09-07: ahora esto también se puede
      // disparar SOLO al abrir la app, sin clic del usuario -- ver
      // "auto-activar chambeador" en FabAsistenteVoz.jsx, así que ya no
      // hay garantía de que el navegador lo permita). Se revierte el
      // estado "activo" en vez de quedar en un estado inconsistente.
      activoRef.current = false;
      setActivo(false);
    }
  }, [soportado, detener]);

  // Limpieza si el componente que usa el hook se desmonta con el
  // detector todavía activo.
  useEffect(() => detener, [detener]);

  return { soportado, activo, iniciar, detener };
}

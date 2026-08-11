import { useCallback, useRef, useState } from "react";

const DURACION_MAXIMA_MS = 30000;

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

  const detener = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

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
            stream.getTracks().forEach((t) => t.stop());
            setEstado("inactivo");
            const blob = new Blob(fragmentosRef.current, { type: "audio/webm" });
            resolve(blob);
          };

          mediaRecorderRef.current = recorder;
          recorder.start();
          setEstado("grabando");
          timeoutRef.current = setTimeout(detener, DURACION_MAXIMA_MS);
        })
        .catch(() => {
          setError("No se pudo acceder al micrófono. Revisa los permisos del navegador.");
          reject(new Error("sin_permiso_microfono"));
        });
    });
  }, [detener]);

  return { estado, error, iniciar, detener };
}

let contextoAudio = null;

const obtenerContexto = () => {
  if (!contextoAudio) {
    const AudioContextImpl = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextImpl) return null;
    contextoAudio = new AudioContextImpl();
  }
  if (contextoAudio.state === "suspended") {
    contextoAudio.resume();
  }
  return contextoAudio;
};

// Varios navegadores móviles (Chrome/Android, Safari/iOS) solo permiten
// crear/reanudar un AudioContext dentro de un gesto de usuario SÍNCRONO —
// si se crea por primera vez dentro de un callback async (ej. tras esperar
// a que termine de hablar el asistente), puede quedar mudo sin ningún error.
// Se llama una sola vez, de forma síncrona, en el primer clic real del
// usuario (botón "Grabar" o el toggle de voz) para "desbloquear" el audio
// antes de que el modo manos-libres intente reproducir nada por su cuenta.
export function desbloquearAudio() {
  obtenerContexto();
}

/**
 * Tono corto (Web Audio API, sin archivo de audio) que sirve de señal
 * audible: "el asistente terminó de hablar, ahora puedes decir tu respuesta".
 * Devuelve una Promise que resuelve cuando termina el tono, para poder
 * esperarlo antes de empezar a grabar.
 */
export function reproducirBeep() {
  return new Promise((resolve) => {
    const ctx = obtenerContexto();
    if (!ctx) {
      resolve();
      return;
    }

    const duracionMs = 180;
    const oscilador = ctx.createOscillator();
    const ganancia = ctx.createGain();
    oscilador.type = "sine";
    oscilador.frequency.value = 880;
    ganancia.gain.setValueAtTime(0.0001, ctx.currentTime);
    ganancia.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.01);
    ganancia.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duracionMs / 1000);

    oscilador.connect(ganancia);
    ganancia.connect(ctx.destination);
    oscilador.start();
    oscilador.stop(ctx.currentTime + duracionMs / 1000);
    oscilador.onended = () => resolve();

    setTimeout(resolve, duracionMs + 50);
  });
}

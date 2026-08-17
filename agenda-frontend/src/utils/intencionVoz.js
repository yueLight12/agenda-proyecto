const PALABRAS_CONFIRMAR = ["si", "sí", "confirmo", "confirmar", "dale", "adelante", "hazlo", "correcto", "ok", "okay", "vale"];
const PALABRAS_CANCELAR = ["no", "cancela", "cancelar", "cancelo", "detente", "olvidalo", "olvídalo"];
const FRASES_REPETIR = ["repite", "repetir", "otra vez", "de nuevo", "vuelve a decir"];

const normalizar = (texto) =>
  texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    // Whisper transcribe CON puntuación ("Sí, confirmo."): sin esto, el
    // token real es "confirmo." (con punto) y nunca matchea "confirmo" de
    // la lista — bug real reportado por Yue el 2026-08-16.
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim();

/**
 * Clasifica una respuesta hablada en confirmar/cancelar/repetir por palabras
 * clave. Las palabras de una sola palabra se matchean por TOKEN completo (no
 * substring) — un match por substring libre ya causó un bug real en este
 * repo (resolver_persona_en_equipo, backend: "Ana" matcheaba dentro de
 * "Diana"). Frases de 2+ palabras sí usan includes() sobre el texto normalizado.
 */
export function clasificarIntencionVoz(texto) {
  if (!texto) return null;
  const normalizado = normalizar(texto);
  const tokens = normalizado.split(/\s+/).filter(Boolean);

  if (FRASES_REPETIR.some((f) => normalizado.includes(normalizar(f)))) return "repetir";
  if (PALABRAS_CANCELAR.some((p) => tokens.includes(normalizar(p)))) return "cancelar";
  if (PALABRAS_CONFIRMAR.some((p) => tokens.includes(normalizar(p)))) return "confirmar";
  return null;
}

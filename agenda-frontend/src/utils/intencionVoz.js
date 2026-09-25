const PALABRAS_CONFIRMAR = ["si", "sí", "confirmo", "confirmar", "dale", "adelante", "hazlo", "correcto", "ok", "okay", "vale"];
const PALABRAS_CANCELAR = ["no", "cancela", "cancelar", "cancelo", "detente", "olvidalo", "olvídalo"];
const FRASES_REPETIR = ["repite", "repetir", "otra vez", "de nuevo", "vuelve a decir"];
// Palabras que modifican un cancelar/confirmar sin aportar contenido nuevo
// (2026-09-25) -- "cancela TODO" sigue siendo un cancelar puro, no una
// corrección con la palabra "todo" como si fuera un dato nuevo.
const PALABRAS_MODIFICADORAS = ["todo", "todos", "ya", "por", "favor"];

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
 * Clasifica una respuesta hablada en confirmar/cancelar/corregir/repetir por
 * palabras clave. Las palabras de una sola palabra se matchean por TOKEN
 * completo (no substring) — un match por substring libre ya causó un bug
 * real en este repo (resolver_persona_en_equipo, backend: "Ana" matcheaba
 * dentro de "Diana"). Frases de 2+ palabras sí usan includes() sobre el
 * texto normalizado.
 *
 * "corregir" (2026-09-25, Fase 3 del plan de fluidez de Chambeador): antes
 * "no, mejor el viernes" se clasificaba como CANCELAR puro (solo por el
 * "no" suelto) y tiraba toda la propuesta en vez de ajustarla -- bug real,
 * justo lo opuesto a sentirse conversacional. Si el texto trae una palabra
 * de cancelar PERO además tiene contenido sustancial además de esa palabra,
 * se asume que es una corrección sobre la marcha, no un cancelar total.
 */
export function clasificarIntencionVoz(texto) {
  if (!texto) return null;
  const normalizado = normalizar(texto);
  const tokens = normalizado.split(/\s+/).filter(Boolean);
  const tokensCancelar = new Set(PALABRAS_CANCELAR.map(normalizar));

  if (FRASES_REPETIR.some((f) => normalizado.includes(normalizar(f)))) return "repetir";
  if (PALABRAS_CANCELAR.some((p) => tokens.includes(normalizar(p)))) {
    const tokensModificadores = new Set(PALABRAS_MODIFICADORAS.map(normalizar));
    const restantes = tokens.filter((t) => !tokensCancelar.has(t) && !tokensModificadores.has(t));
    return restantes.length === 0 ? "cancelar" : "corregir";
  }
  if (PALABRAS_CONFIRMAR.some((p) => tokens.includes(normalizar(p)))) return "confirmar";
  return null;
}

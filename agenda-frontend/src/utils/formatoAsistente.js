// Limpieza y formato mínimos del texto que puede venir del LLM (markdown
// ligero: negritas "**texto**", varios puntos numerados pegados en una sola
// línea/oración) — sin agregar una librería de markdown completa, solo lo
// necesario para que el resultado se vea y se escuche bien.

const QUITAR_NEGRITAS = /\*\*(.*?)\*\*/g;
const SIMBOLOS_MARKDOWN = /[*_#`]/g;

// Para hablar (speechSynthesis leería un "**" literal como "asterisco
// asterisco"): sin símbolos de markdown, todo en una sola línea fluida.
export function limpiarParaVoz(texto) {
  if (!texto) return texto;
  return texto
    .replace(QUITAR_NEGRITAS, "$1")
    .replace(SIMBOLOS_MARKDOWN, "")
    .replace(/\n+/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
}

// Para mostrar en pantalla: separa en líneas (por saltos de línea reales, o
// por numeración "1. ... 2. ..." que a veces llega pegada en una sola
// oración) — cada línea conserva sus "**negritas**" para que el componente
// de render las convierta a <strong> en vez de mostrar los asteriscos tal cual.
export function dividirEnLineas(texto) {
  if (!texto) return [];
  return texto
    .split(/\n+/)
    .flatMap((linea) => linea.split(/(?=(?:^|\s)\d+\.\s)/))
    .map((l) => l.trim())
    .filter(Boolean);
}

// Convierte "**texto**" en fragmentos { texto, negrita } para renderizar
// con <strong> sin dejar los asteriscos literales.
export function partesConNegrita(linea) {
  return linea
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((parte) =>
      parte.startsWith("**") && parte.endsWith("**")
        ? { texto: parte.slice(2, -2), negrita: true }
        : { texto: parte, negrita: false }
    );
}

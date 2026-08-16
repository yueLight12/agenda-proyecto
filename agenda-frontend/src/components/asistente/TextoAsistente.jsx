import { dividirEnLineas, partesConNegrita } from "../../utils/formatoAsistente";

function Linea({ texto }) {
  return partesConNegrita(texto).map((parte, i) =>
    parte.negrita ? <strong key={i}>{parte.texto}</strong> : <span key={i}>{parte.texto}</span>
  );
}

// Muestra texto que puede venir del LLM (con negritas "**texto**" o varios
// puntos pegados en una sola oración) de forma legible: una línea por
// elemento, sin asteriscos literales — sin agregar una librería de markdown
// completa, solo el mínimo necesario para una buena lectura en pantalla.
export default function TextoAsistente({ texto, className }) {
  const lineas = dividirEnLineas(texto);
  if (lineas.length === 0) return null;
  if (lineas.length === 1) {
    return (
      <p className={className}>
        <Linea texto={lineas[0]} />
      </p>
    );
  }
  return (
    <div className={className} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {lineas.map((linea, i) => (
        <p key={i} style={{ margin: 0 }}>
          <Linea texto={linea} />
        </p>
      ))}
    </div>
  );
}

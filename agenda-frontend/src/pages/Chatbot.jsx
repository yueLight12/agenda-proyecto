import { useState } from "react";
import { chatbotApi } from "../api/endpoints";

export default function Chatbot() {
  const [pregunta, setPregunta] = useState("");
  const [mensajes, setMensajes] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  const enviar = async (e) => {
    e.preventDefault();
    const texto = pregunta.trim();
    if (!texto || enviando) return;

    setMensajes((prev) => [...prev, { autor: "usuario", texto }]);
    setPregunta("");
    setEnviando(true);
    setError("");

    try {
      const { respuesta } = await chatbotApi.consultar(texto);
      setMensajes((prev) => [...prev, { autor: "bot", texto: respuesta }]);
    } catch {
      setError(
        "El asistente no respondió. Verifica que el modelo local (Ollama) esté corriendo."
      );
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="stack">
      <h1>Asistente de consulta</h1>
      <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
        Pregunta en lenguaje natural sobre tus proyectos y entregables (ej. "¿qué
        tengo pendiente esta semana?", "¿cómo va el Proyecto Alfa?"). Solo consulta,
        no modifica nada.
      </p>

      <div className="card stack" style={{ minHeight: 320 }}>
        {mensajes.length === 0 && (
          <p style={{ color: "var(--color-text-muted)" }}>
            Escribe tu primera pregunta abajo.
          </p>
        )}
        {mensajes.map((m, i) => (
          <div
            key={i}
            style={{
              alignSelf: m.autor === "usuario" ? "flex-end" : "flex-start",
              maxWidth: "80%",
              background:
                m.autor === "usuario" ? "var(--color-teal-500)" : "var(--color-pending-bg)",
              color: m.autor === "usuario" ? "#fff" : "var(--color-text)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-2) var(--space-3)",
              whiteSpace: "pre-wrap",
            }}
          >
            {m.texto}
          </div>
        ))}
        {enviando && (
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
            Pensando... (el modelo local puede tardar hasta un minuto)
          </p>
        )}
        {error && <p className="error-text">{error}</p>}
      </div>

      <form onSubmit={enviar} style={{ display: "flex", gap: 8 }}>
        <input
          className="input"
          value={pregunta}
          onChange={(e) => setPregunta(e.target.value)}
          placeholder="Escribe tu pregunta..."
          disabled={enviando}
        />
        <button className="btn btn--primary" type="submit" disabled={enviando}>
          Enviar
        </button>
      </form>
    </div>
  );
}

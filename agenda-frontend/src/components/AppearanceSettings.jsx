import { useEffect, useState } from "react";
import { useTema } from "../hooks/useTema";
import { usePreferenciasApariencia } from "../hooks/usePreferenciasApariencia";

// Panel "Personalizar apariencia" (2026-08-26, a petición de Yue) -- FASE 2:
// ya conectado a persistencia real (usePreferenciasApariencia.js ->
// GET/PATCH /usuarios/me/preferencias). El tema claro/oscuro NO pasa por
// aquí -- sigue siendo useTema() (localStorage + [data-theme]), solo se
// manda su valor actual al guardar para que quede reflejado en el registro
// del backend (multi-dispositivo a futuro), sin duplicar su lógica de
// "sigue al sistema hasta que el usuario elige".
const FORMAS = [
  { valor: "square", etiqueta: "Cuadrado", radio: "4px" },
  { valor: "rounded", etiqueta: "Redondeado", radio: "12px" },
  { valor: "circle", etiqueta: "Círculo", radio: "999px" },
];

const TARJETAS_INFO = {
  tarea: "Tarea",
  proyecto: "Proyecto",
  persona: "Persona",
  agenda: "Agenda (calendario)",
  rendimiento: "Rendimiento",
};

export default function AppearanceSettings({ onCerrar }) {
  const { tema, alternarTema } = useTema();
  const { shape: shapeGuardado, cardOrder: cardOrderGuardado, cargando, guardar: guardarPreferencias } =
    usePreferenciasApariencia();
  // Estado local de edición (borrador) -- separado del guardado para que
  // "Guardar cambios" siga siendo un paso explícito, no autosave en cada clic.
  const [shape, setShape] = useState(shapeGuardado);
  const [cardOrder, setCardOrder] = useState(cardOrderGuardado);
  const [guardado, setGuardado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  // Cuando el GET inicial del hook responde (llega después del primer
  // render), sincroniza el borrador si el usuario no había tocado nada
  // todavía -- si ya estaba editando, no le pisamos su cambio a medias.
  useEffect(() => {
    if (!guardado) {
      setShape(shapeGuardado);
      setCardOrder(cardOrderGuardado);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shapeGuardado, cardOrderGuardado]);

  const radioActual = FORMAS.find((f) => f.valor === shape)?.radio || "12px";

  const mover = (indice, direccion) => {
    const destino = indice + direccion;
    if (destino < 0 || destino >= cardOrder.length) return;
    setCardOrder((actual) => {
      const copia = [...actual];
      [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
      return copia;
    });
    setGuardado(false);
  };

  const elegirShape = (valor) => {
    setShape(valor);
    setGuardado(false);
  };

  const guardar = async () => {
    setGuardando(true);
    setError("");
    try {
      await guardarPreferencias({ shape, cardOrder, theme: tema });
      setGuardado(true);
    } catch (e) {
      setError(e?.response?.data?.detail || "No se pudieron guardar los cambios, intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="apariencia stack">
      <section className="apariencia__seccion">
        <h3 className="apariencia__titulo-seccion">Forma</h3>
        <div className="apariencia__formas" role="group" aria-label="Forma de tarjetas y botones">
          {FORMAS.map((f) => (
            <button
              key={f.valor}
              type="button"
              className={`apariencia__forma-btn${shape === f.valor ? " apariencia__forma-btn--activo" : ""}`}
              onClick={() => elegirShape(f.valor)}
              aria-pressed={shape === f.valor}
            >
              <span className="apariencia__forma-swatch" style={{ borderRadius: f.radio }} aria-hidden="true" />
              <span>{f.etiqueta}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="apariencia__seccion">
        <h3 className="apariencia__titulo-seccion">Tema</h3>
        <div className="apariencia__formas" role="group" aria-label="Tema claro u oscuro">
          <button
            type="button"
            className={`apariencia__forma-btn${tema === "claro" ? " apariencia__forma-btn--activo" : ""}`}
            onClick={() => tema !== "claro" && alternarTema()}
            aria-pressed={tema === "claro"}
          >
            <span className="apariencia__forma-swatch apariencia__forma-swatch--claro" aria-hidden="true">☀️</span>
            <span>Claro</span>
          </button>
          <button
            type="button"
            className={`apariencia__forma-btn${tema === "oscuro" ? " apariencia__forma-btn--activo" : ""}`}
            onClick={() => tema !== "oscuro" && alternarTema()}
            aria-pressed={tema === "oscuro"}
          >
            <span className="apariencia__forma-swatch apariencia__forma-swatch--oscuro" aria-hidden="true">🌙</span>
            <span>Oscuro</span>
          </button>
        </div>
      </section>

      <section className="apariencia__seccion">
        <h3 className="apariencia__titulo-seccion">Orden de tarjetas en "Quiero asignar"</h3>
        <ul className="apariencia__lista-orden">
          {cardOrder.map((tipo, indice) => (
            <li key={tipo} className="apariencia__item-orden">
              <span>{TARJETAS_INFO[tipo] || tipo}</span>
              <span className="apariencia__item-orden-botones">
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => mover(indice, -1)}
                  disabled={indice === 0}
                  aria-label={`Subir ${TARJETAS_INFO[tipo] || tipo}`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => mover(indice, 1)}
                  disabled={indice === cardOrder.length - 1}
                  aria-label={`Bajar ${TARJETAS_INFO[tipo] || tipo}`}
                >
                  ↓
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="apariencia__seccion">
        <h3 className="apariencia__titulo-seccion">Vista previa</h3>
        <div className="apariencia__preview">
          {cardOrder.map((tipo) => (
            <div key={tipo} className="apariencia__preview-tarjeta" style={{ borderRadius: radioActual }}>
              {TARJETAS_INFO[tipo] || tipo}
            </div>
          ))}
        </div>
      </section>

      <div className="apariencia__acciones">
        {guardado && <span className="apariencia__guardado-msg">Guardado</span>}
        {error && <span className="error-text">{error}</span>}
        <button type="button" className="btn btn--primary" onClick={guardar} disabled={guardando || cargando}>
          {guardando ? "Guardando..." : "Guardar cambios"}
        </button>
        {onCerrar && (
          <button type="button" className="btn btn--ghost" onClick={onCerrar}>
            Cerrar
          </button>
        )}
      </div>
    </div>
  );
}

import { useState } from "react";
import ModalAsistenteVoz from "./ModalAsistenteVoz";
import { useFabAntizoom } from "../hooks/useFabAntizoom";

/**
 * Botón flotante de micrófono, disponible en toda la app (montado una sola
 * vez en AppLayout.jsx) — el asistente de voz ejecuta acciones sin tener
 * que navegar a ninguna pantalla en particular.
 *
 * `variante="dentro-modal"` (2026-08-23, a petición de Yue): además de la
 * instancia global de la pantalla base, Modal.jsx monta una copia por
 * modal abierto, posicionada dentro de la tarjeta (esquina inferior
 * izquierda) en vez de fija a toda la pantalla -- así el asistente queda
 * visible/usable sin tener que cerrar el modal para llegar al flotante
 * global de atrás.
 */
export default function FabAsistenteVoz({ proyectoIdContexto, variante = "global" }) {
  const [abierto, setAbierto] = useState(false);
  // Solo la variante global usa position: fixed a toda la página (la de
  // "dentro-modal" es position: absolute anclada a su propia tarjeta, no
  // le afecta el mismo problema de zoom -- ver useFabAntizoom.js).
  // 24px = var(--space-4) en tokens.css, mismo margen que ya usaba
  // .fab-asistente-voz -- para no correr el botón de lugar en el caso
  // normal (sin zoom), solo corrige cuando el viewport visible diverge.
  const estiloAntizoom = useFabAntizoom(24);

  return (
    <>
      <button
        className={
          variante === "dentro-modal"
            ? "btn btn--primary fab-asistente-voz fab-asistente-voz--en-modal"
            : "btn btn--primary fab-asistente-voz"
        }
        style={variante === "global" ? estiloAntizoom || undefined : undefined}
        type="button"
        onClick={() => setAbierto(true)}
        aria-label="Abrir asistente de voz"
        title="Asistente de voz"
      >
        🎙️
      </button>
      {abierto && (
        <ModalAsistenteVoz
          proyectoIdContexto={proyectoIdContexto}
          onCerrar={() => setAbierto(false)}
        />
      )}
    </>
  );
}

import { useState } from "react";
import ModalAsistenteVoz from "./ModalAsistenteVoz";

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

  return (
    <>
      <button
        className={
          variante === "dentro-modal"
            ? "btn btn--primary fab-asistente-voz fab-asistente-voz--en-modal"
            : "btn btn--primary fab-asistente-voz"
        }
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

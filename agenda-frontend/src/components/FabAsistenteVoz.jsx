import { useState } from "react";
import ModalAsistenteVoz from "./ModalAsistenteVoz";

/**
 * Botón flotante de micrófono, disponible en toda la app (montado una sola
 * vez en AppLayout.jsx) — el asistente de voz ejecuta acciones sin tener
 * que navegar a ninguna pantalla en particular.
 */
export default function FabAsistenteVoz({ proyectoIdContexto }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <button
        className="btn btn--primary fab-asistente-voz"
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

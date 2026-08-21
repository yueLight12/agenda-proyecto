import Modal from "../Modal";

// Primer paso de la tarjeta "Persona" en Agenda Plan B (2026-08-20, a
// petición de Yue: "sería parecido a Tarea, en el de persona será para
// asignar tareas/entregables a esa persona") -- elegir primero de la lista
// de tu equipo, y con eso AgendaPlanB.jsx abre ModalAsignarTareaRapida ya
// con `personaInicialId` fijo, saltando directo al paso de elegir tema.
export default function SelectorPersona({ equipo, error, onElegir, onCerrar }) {
  return (
    <Modal titulo="¿A quién le quieres asignar una tarea?" onCerrar={onCerrar}>
      <div className="stack">
        {error && <p className="error-text">{error}</p>}
        {!error && equipo.length === 0 && (
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
            No tienes personas en tu equipo todavía.
          </p>
        )}
        {equipo.map((m) => (
          <button
            key={m.usuario_id}
            type="button"
            className="planb__persona-fila"
            onClick={() => onElegir(String(m.usuario_id))}
          >
            <span>{m.nombre}</span>
            {m.puesto && (
              <span style={{ fontSize: "0.78rem", color: "var(--color-text-muted)" }}>{m.puesto}</span>
            )}
          </button>
        ))}
      </div>
    </Modal>
  );
}

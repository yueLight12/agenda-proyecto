import { useState } from "react";
import Modal from "../Modal";
import { colorAvatar, iniciales } from "../../utils/avatarPersona";

// Primer paso de la tarjeta "Persona" en Agenda Plan B (2026-08-20, a
// petición de Yue: "sería parecido a Tarea, en el de persona será para
// asignar tareas/entregables a esa persona") -- elegir primero de la lista
// de tu equipo, y con eso AgendaPlanB.jsx abre ModalAsignarTareaRapida ya
// con `personaInicialId` fijo, saltando directo al paso de elegir tema.
//
// Buscador + avatares con iniciales (2026-08-21, diseño "grafito", a
// partir de una referencia tipo "Team Directory") -- el buscador filtra de
// verdad (útil para equipos grandes, funciona en los 4 estilos, no solo
// visual); los avatares son iniciales con color por persona porque el
// sistema no tiene fotos de perfil, sin inventar un "punto de estado en
// línea" que no existe como dato real.
export default function SelectorPersona({ equipo, error, onElegir, onCerrar }) {
  const [busqueda, setBusqueda] = useState("");
  const equipoFiltrado = equipo.filter((m) =>
    m.nombre.toLowerCase().includes(busqueda.trim().toLowerCase())
  );

  return (
    <Modal titulo="¿A quién le quieres asignar una tarea?" onCerrar={onCerrar}>
      <div className="stack">
        {error && <p className="error-text">{error}</p>}
        {!error && equipo.length === 0 && (
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
            No tienes personas en tu equipo todavía.
          </p>
        )}
        {!error && equipo.length > 0 && (
          <input
            className="input"
            type="search"
            placeholder="Buscar en tu equipo..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            aria-label="Buscar en tu equipo"
          />
        )}
        {!error && equipo.length > 0 && equipoFiltrado.length === 0 && (
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
            Nadie coincide con "{busqueda}".
          </p>
        )}
        {equipoFiltrado.map((m) => (
          <button
            key={m.usuario_id}
            type="button"
            className="planb__persona-fila"
            onClick={() => onElegir(String(m.usuario_id))}
          >
            <span
              className="planb__persona-avatar"
              style={{ background: colorAvatar(m.nombre) }}
              aria-hidden="true"
            >
              {iniciales(m.nombre)}
            </span>
            <span className="planb__persona-datos">
              <span className="planb__persona-nombre">{m.nombre}</span>
              {m.puesto && <span className="planb__persona-puesto">{m.puesto}</span>}
            </span>
            <span className="planb__persona-elegir" aria-hidden="true">
              Elegir
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

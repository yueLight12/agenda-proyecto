import { useState } from "react";
import { etiquetaRol } from "../utils/rolLabels";

/**
 * Buscador de personas para invitar (como el "Enter name or e-mail" de
 * Teams), en vez de una lista completa de checkboxes -- 2026-08-17, a
 * petición de Yue. Hand-rolled (sin librería nueva): la lista de
 * invitables es chica (decenas de personas cuando mucho, confirmado
 * contra `listar_invitables_reunion`), así que un filtro en el cliente
 * basta, no hace falta un endpoint de búsqueda en el servidor.
 *
 * `candidatos`: [{usuario_id, nombre, puesto?, rol}]. `seleccionadosIds`:
 * array de ids ya invitados. `onCambiar(ids)`: nuevo array completo.
 */
export default function BuscadorInvitados({ candidatos, seleccionadosIds, onCambiar }) {
  const [query, setQuery] = useState("");

  const seleccionados = candidatos.filter((c) => seleccionadosIds.includes(c.usuario_id));

  const resultados =
    query.trim().length === 0
      ? []
      : candidatos
          .filter((c) => !seleccionadosIds.includes(c.usuario_id))
          .filter((c) => {
            const texto = `${c.nombre} ${c.puesto || ""}`.toLowerCase();
            return texto.includes(query.trim().toLowerCase());
          })
          .slice(0, 8);

  const agregar = (usuarioId) => {
    onCambiar([...seleccionadosIds, usuarioId]);
    setQuery("");
  };

  const quitar = (usuarioId) => {
    onCambiar(seleccionadosIds.filter((id) => id !== usuarioId));
  };

  return (
    <div className="stack" style={{ gap: 6 }}>
      {seleccionados.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {seleccionados.map((m) => (
            <span
              key={m.usuario_id}
              className="badge"
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem" }}
            >
              {m.nombre}
              <button
                type="button"
                onClick={() => quitar(m.usuario_id)}
                aria-label={`Quitar a ${m.nombre}`}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  color: "inherit",
                  fontSize: "0.9rem",
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div style={{ position: "relative" }}>
        <input
          className="input"
          type="text"
          placeholder="Escribe un nombre para invitar..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {resultados.length > 0 && (
          <div
            className="card"
            style={{
              position: "absolute",
              zIndex: 5,
              top: "100%",
              left: 0,
              right: 0,
              marginTop: 4,
              padding: 4,
              maxHeight: 220,
              overflowY: "auto",
            }}
          >
            {resultados.map((c) => (
              <button
                key={c.usuario_id}
                type="button"
                className="btn btn--ghost"
                style={{ width: "100%", justifyContent: "flex-start", textAlign: "left" }}
                onClick={() => agregar(c.usuario_id)}
              >
                {c.nombre} {c.puesto ? `— ${c.puesto}` : ""} ({etiquetaRol(c.rol)})
              </button>
            ))}
          </div>
        )}
        {query.trim().length > 0 && resultados.length === 0 && (
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.78rem", margin: "4px 0 0" }}>
            Nadie coincide con "{query}".
          </p>
        )}
      </div>
    </div>
  );
}

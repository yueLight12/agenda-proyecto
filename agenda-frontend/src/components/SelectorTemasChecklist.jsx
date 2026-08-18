import { useEffect, useState } from "react";
import { reunionesApi, seriesReunionApi } from "../api/endpoints";
import Modal from "./Modal";

// Mismo criterio que construirArbol en KanbanSupervisores.jsx: un nodo
// cuyo parent_id no está entre los visibles se trata como raíz.
function construirArbol(proyectos) {
  const idsVisibles = new Set(proyectos.map((p) => p.id));
  const hijosPorPadre = new Map();
  const raices = [];
  proyectos.forEach((p) => {
    const esRaiz = !p.parent_id || !idsVisibles.has(p.parent_id);
    if (esRaiz) {
      raices.push(p);
    } else {
      if (!hijosPorPadre.has(p.parent_id)) hijosPorPadre.set(p.parent_id, []);
      hijosPorPadre.get(p.parent_id).push(p);
    }
  });
  return { raices, hijosPorPadre };
}

// Este id + todos sus descendientes -- para marcar/desmarcar en cascada
// (2026-08-18, decisión de Yue: marcar un tema incluye a sus subtemas).
function idsDescendientes(id, hijosPorPadre) {
  const hijos = hijosPorPadre.get(id) || [];
  return [id, ...hijos.flatMap((h) => idsDescendientes(h.id, hijosPorPadre))];
}

function NodoCheckbox({ proyecto, hijosPorPadre, seleccionados, onToggle, nivel, deshabilitado }) {
  const hijos = hijosPorPadre.get(proyecto.id) || [];
  return (
    <div style={nivel > 0 ? { marginLeft: 18, marginTop: 4 } : { marginTop: 4 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem" }}>
        <input
          type="checkbox"
          checked={seleccionados.has(proyecto.id)}
          onChange={() => onToggle(proyecto)}
          disabled={deshabilitado}
        />
        {proyecto.nombre}
      </label>
      {hijos.map((h) => (
        <NodoCheckbox
          key={h.id}
          proyecto={h}
          hijosPorPadre={hijosPorPadre}
          seleccionados={seleccionados}
          onToggle={onToggle}
          nivel={nivel + 1}
          deshabilitado={deshabilitado}
        />
      ))}
    </div>
  );
}

/**
 * Selector de temas incluidos en la agenda de una junta -- generalizado
 * 2026-08-18 (a petición de Yue) desde el caso original del checklist 1:1
 * a CUALQUIER reunión/serie: en vez de agregar temas uno por uno, muestra
 * el árbol completo y deja elegir con checks cuáles aplican a ESTA junta
 * en particular. Marcar un tema marca también sus subtemas; desmarcar
 * hace lo mismo en cascada hacia abajo -- y es STICKY (2026-08-18,
 * confirmado con Yue): desmarcar archiva el ítem del checklist de verdad,
 * no solo "para esta semana"; la próxima semana no reaparece solo si se
 * vuelve a marcar. Es el mismo comportamiento que ya tenía el reemplazo
 * por conjunto del backend, aquí solo se ajusta cuándo se dispara.
 *
 * `inline` (2026-08-18, a petición de Yue -- "evitar tantos clicks"): sin
 * esto, es un Modal con botón "Guardar" (usado en KanbanSupervisores.jsx,
 * donde el espacio es angosto). Con `inline`, se dibuja directo sin Modal
 * y cada click guarda al instante -- sin diálogo ni botón aparte (usado en
 * ModalReunion.jsx).
 *
 * Exactamente uno de `serieId`/`reunionId`. La selección inicial se lee
 * sola de la agenda actual de la junta (ítems tipo=tema ya presentes); si
 * todavía no tiene ninguno (junta recién creada) y `defaultTodos` es true,
 * arranca con TODO marcado -- el organizador desmarca lo que no aplique,
 * en vez de partir de una lista vacía.
 *
 * Solo quien puede editar la agenda de esa junta puede usarlo -- el
 * backend lo valida (puede_editar_serie / puede_editar_reunion), este
 * componente solo se muestra desde donde ya se sabe que aplica.
 */
export default function SelectorTemasChecklist({
  serieId = null,
  reunionId = null,
  defaultTodos = false,
  inline = false,
  onGuardado,
  onCerrar,
}) {
  const [hijosPorPadre, setHijosPorPadre] = useState(new Map());
  const [raices, setRaices] = useState([]);
  const [seleccionados, setSeleccionados] = useState(new Set());
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const cargarAgendaActual = serieId ? seriesReunionApi.agenda(serieId) : reunionesApi.agenda(reunionId);
    // Árbol acotado a organizador+invitados de ESTA junta (2026-08-18, a
    // petición de Yue: "si es entre Diana y Bernardo, solo deberían
    // aparecer los temas que tienen Diana y Bernardo") -- no el árbol
    // completo visible al usuario, que para alguien con Dirección global
    // sería prácticamente todo. Ver ModalReunion.jsx, que fuerza un
    // remount de este componente (vía `key`) cuando cambian los invitados
    // guardados, para que esto se recalcule.
    const cargarTemas = serieId ? seriesReunionApi.temasRelevantes(serieId) : reunionesApi.temasRelevantes(reunionId);
    Promise.all([cargarTemas, cargarAgendaActual])
      .then(([lista, agenda]) => {
        const { raices: r, hijosPorPadre: hpp } = construirArbol(lista);
        setRaices(r);
        setHijosPorPadre(hpp);
        const idsActuales = agenda
          .filter((i) => i.tipo === "tema")
          .map((i) => i.seccion_proyecto_id)
          .filter((id) => id != null);
        setSeleccionados(
          new Set(idsActuales.length === 0 && defaultTodos ? lista.map((p) => p.id) : idsActuales)
        );
      })
      .catch(() => setError("No se pudo cargar la lista de temas."))
      .finally(() => setCargando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const guardar = async (idsAGuardar) => {
    setGuardando(true);
    setError("");
    try {
      if (serieId) await seriesReunionApi.actualizarTemas(serieId, Array.from(idsAGuardar));
      else await reunionesApi.actualizarTemas(reunionId, Array.from(idsAGuardar));
      await onGuardado();
    } catch {
      setError("No se pudieron guardar los temas de esta junta.");
    } finally {
      setGuardando(false);
    }
  };

  const toggle = (proyecto) => {
    setSeleccionados((prev) => {
      const siguiente = new Set(prev);
      const marcando = !siguiente.has(proyecto.id);
      for (const id of idsDescendientes(proyecto.id, hijosPorPadre)) {
        if (marcando) siguiente.add(id);
        else siguiente.delete(id);
      }
      if (inline) guardar(siguiente);
      return siguiente;
    });
  };

  const contenido = (
    <div className="stack" style={{ gap: 10 }}>
      {!inline && (
        <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", margin: 0 }}>
          Elige qué temas cubre esta junta — marcar un tema incluye también sus subtemas.
        </p>
      )}
      {cargando ? (
        <p style={{ fontSize: "0.85rem" }}>Cargando temas...</p>
      ) : raices.length === 0 ? (
        <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
          Ningún tema en común entre quien organiza y los invitados todavía.
        </p>
      ) : (
        <div className="stack" style={{ gap: 2, maxHeight: inline ? "none" : 360, overflowY: inline ? "visible" : "auto" }}>
          {raices.map((p) => (
            <NodoCheckbox
              key={p.id}
              proyecto={p}
              hijosPorPadre={hijosPorPadre}
              seleccionados={seleccionados}
              onToggle={toggle}
              nivel={0}
              deshabilitado={inline && guardando}
            />
          ))}
        </div>
      )}
      {error && <p className="error-text">{error}</p>}
      {inline && guardando && (
        <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", margin: 0 }}>Guardando...</p>
      )}
      {!inline && (
        <div className="list-inline" style={{ borderBottom: "none", padding: 0, justifyContent: "flex-end" }}>
          <button
            className="btn btn--primary"
            type="button"
            onClick={async () => {
              await guardar(seleccionados);
              onCerrar();
            }}
            disabled={guardando || cargando}
          >
            {guardando ? "Guardando..." : "Guardar"}
          </button>
        </div>
      )}
    </div>
  );

  if (inline) return contenido;
  return (
    <Modal titulo="Temas de esta junta" onCerrar={onCerrar}>
      {contenido}
    </Modal>
  );
}

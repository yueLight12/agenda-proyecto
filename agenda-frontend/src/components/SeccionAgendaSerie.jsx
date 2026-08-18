import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { minutasApi, reunionesApi, seriesReunionApi } from "../api/endpoints";

const ETIQUETAS_ESTADO = {
  revisado: "revisado",
  pendiente: "pendiente",
  revisado_con_pendientes: "revisado, con pendientes nuevos",
};

function ItemAgenda({ item, reunionId, onCambio, ocultarNombre = false }) {
  // Sin reunionId no hay ocurrencia real contra la cual registrar una
  // revisión -- el ítem se ve, pero no se puede marcar.
  // registrarRevisionAgendaItem necesita un reunion_id real en la URL, no
  // acepta null.
  const soloLectura = !reunionId;
  const [abierto, setAbierto] = useState(false);
  const [estado, setEstado] = useState("revisado");
  const [nota, setNota] = useState("");
  const [nuevoPendiente, setNuevoPendiente] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const handleGuardar = async (e) => {
    e.preventDefault();
    setError("");
    setGuardando(true);
    try {
      await minutasApi.registrarRevisionAgendaItem(reunionId, item.id, {
        estado,
        nota: nota || null,
        nuevo_pendiente_texto: estado === "revisado_con_pendientes" ? nuevoPendiente || null : null,
      });
      setAbierto(false);
      setNota("");
      setNuevoPendiente("");
      await onCambio();
    } catch (err) {
      setError(err.response?.data?.detail || "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="card" style={{ padding: 8 }}>
      <button
        type="button"
        className="list-inline list-inline--boton"
        style={{ padding: 0 }}
        onClick={() => !soloLectura && setAbierto((a) => !a)}
        aria-expanded={abierto}
        disabled={soloLectura}
      >
        {!ocultarNombre && <span style={{ fontSize: "0.88rem" }}>{item.nombre}</span>}
        <span style={{ fontSize: "0.78rem", color: "var(--color-text-muted)" }}>
          {ETIQUETAS_ESTADO[item.estado_actual] || item.estado_actual}
          {!soloLectura && ` ${abierto ? "▲" : "▼"}`}
        </span>
      </button>
      {item.detalle && !abierto && (
        <p style={{ fontSize: "0.78rem", color: "var(--color-text-muted)", margin: "4px 0 0" }}>
          {item.detalle}
        </p>
      )}
      {item.ultima_nota && !abierto && (
        <p style={{ fontSize: "0.78rem", color: "var(--color-text-muted)", margin: "4px 0 0" }}>
          "{item.ultima_nota}"
        </p>
      )}

      {abierto && !soloLectura && (
        <form className="stack" onSubmit={handleGuardar} style={{ gap: 6, marginTop: 8 }}>
          <select className="input" value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="revisado">Revisado</option>
            <option value="pendiente">Sigue pendiente</option>
            <option value="revisado_con_pendientes">Revisado, pero surgió algo nuevo</option>
          </select>
          <input
            className="input"
            placeholder="Nota (opcional)"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
          />
          {estado === "revisado_con_pendientes" && (
            <input
              className="input"
              placeholder="¿Qué pendiente nuevo surgió?"
              value={nuevoPendiente}
              onChange={(e) => setNuevoPendiente(e.target.value)}
            />
          )}
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn--primary" type="submit" disabled={guardando} style={{ alignSelf: "flex-start" }}>
            {guardando ? "Guardando..." : "Guardar"}
          </button>
        </form>
      )}
    </div>
  );
}

// Agrupa por sección (seccion_proyecto_id) y arma un árbol real con
// seccion_parent_id (2026-08-17, a petición de Yue -- "subtema" colgaba
// como sección plana en vez de anidarse bajo su tema padre) -- mismo
// criterio que construirArbol en KanbanSupervisores.jsx: una sección cuyo
// padre no está entre las secciones presentes se trata como raíz.
function construirArbolSecciones(grupos) {
  const idsVisibles = new Set(grupos.map((g) => g.id));
  const hijosPorPadre = new Map();
  const raices = [];
  grupos.forEach((g) => {
    const esRaiz = g.id === "general" || !g.parentId || !idsVisibles.has(g.parentId);
    if (esRaiz) {
      raices.push(g);
    } else {
      if (!hijosPorPadre.has(g.parentId)) hijosPorPadre.set(g.parentId, []);
      hijosPorPadre.get(g.parentId).push(g);
    }
  });
  return { raices, hijosPorPadre };
}

function NodoSeccion({ grupo, hijosPorPadre, reunionId, onCambio, expandidos, onToggle, nivel }) {
  const hijos = hijosPorPadre.get(grupo.id) || [];
  const tieneContenido = hijos.length > 0 || grupo.items.length > 0;
  const abierto = expandidos.has(grupo.id);

  return (
    <div style={nivel > 0 ? { marginLeft: 14, borderLeft: "2px solid var(--color-border)", paddingLeft: 10, marginTop: 6 } : { marginTop: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {tieneContenido && (
          <button
            type="button"
            className="btn btn--ghost"
            style={{ padding: "0 4px", fontSize: "0.7rem" }}
            onClick={() => onToggle(grupo.id)}
            aria-expanded={abierto}
            aria-label={abierto ? "Colapsar tema" : "Expandir tema"}
          >
            {abierto ? "▼" : "▶"}
          </button>
        )}
        {grupo.id === "general" ? (
          <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--color-text-muted)" }}>
            {grupo.nombre}
          </span>
        ) : (
          <Link
            to={`/proyectos/${grupo.id}`}
            style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--color-text-muted)" }}
          >
            {grupo.nombre}
          </Link>
        )}
      </div>
      {abierto && (
        <div className="stack" style={{ gap: 4, marginTop: 4 }}>
          {grupo.items.map((item) => (
            <ItemAgenda
              key={item.id}
              item={item}
              reunionId={reunionId}
              onCambio={onCambio}
              // El ítem tipo=tema de esta misma sección repite el nombre
              // que ya muestra el encabezado de arriba (Link a
              // /proyectos/{id}) -- se oculta aquí para no verlo dos veces
              // seguidas (2026-08-18, reportado por Yue), sin perder la
              // tarjeta interactiva (sigue pudiéndose marcar revisado).
              ocultarNombre={item.tipo === "tema" && item.seccion_proyecto_id === grupo.id}
            />
          ))}
          {hijos.map((h) => (
            <NodoSeccion
              key={h.id}
              grupo={h}
              hijosPorPadre={hijosPorPadre}
              reunionId={reunionId}
              onCambio={onCambio}
              expandidos={expandidos}
              onToggle={onToggle}
              nivel={nivel + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Sección "Agenda de esta reunión" dentro de ModalMinuta -- muestra la
 * agenda persistente (de la serie si es una ocurrencia recurrente, o de la
 * propia reunión si es suelta, ver SeccionAgendaChecklist.jsx) con el
 * estado de cada ítem (Fase 2/3, 2026-08-17): lo no revisado sigue
 * apareciendo pendiente de ocurrencia en ocurrencia -- no hay ningún
 * "reseteo", el estado siempre es el de la última vez que se marcó.
 *
 * `serieId` y `reunionId` (2026-08-17, reuniones sueltas): pasar
 * `serieId` cuando la reunión es ocurrencia de una serie (carga la agenda
 * persistente de la serie); si `serieId` es null, se asume reunión suelta
 * y se carga su propia agenda vía `reunionesApi.agenda(reunionId)`.
 * `reunionId` siempre se manda (es contra quién se registra la revisión).
 */
export default function SeccionAgendaSerie({ serieId, reunionId }) {
  const [agenda, setAgenda] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [expandidos, setExpandidos] = useState(new Set());

  const cargar = () =>
    (serieId ? seriesReunionApi.agenda(serieId) : reunionesApi.agenda(reunionId))
      .then(setAgenda)
      .catch(() => setError("No se pudo cargar la agenda de esta reunión."))
      .finally(() => setCargando(false));

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serieId, reunionId]);

  const toggle = (id) =>
    setExpandidos((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });

  if (cargando) return <p style={{ fontSize: "0.85rem" }}>Cargando agenda...</p>;
  if (error) return <p className="error-text">{error}</p>;

  // Agrupado por sección, ahora como árbol real (seccion_parent_id) en vez
  // de una lista plana -- ej. "subtema" cuelga bajo su tema padre en vez
  // de aparecer como una sección más al mismo nivel. Un punto sin
  // seccion_proyecto_id cae en "General".
  const gruposPorId = new Map();
  agenda.forEach((it) => {
    const clave = it.seccion_proyecto_id || "general";
    if (!gruposPorId.has(clave)) {
      gruposPorId.set(clave, {
        id: clave,
        nombre: it.seccion_nombre || "General",
        parentId: it.seccion_parent_id || null,
        items: [],
      });
    }
    gruposPorId.get(clave).items.push(it);
  });
  const { raices, hijosPorPadre } = construirArbolSecciones(Array.from(gruposPorId.values()));

  return (
    <div className="stack" style={{ gap: 6 }}>
      <p style={{ color: "var(--color-text-muted)", fontSize: "0.78rem", margin: 0 }}>
        {reunionId
          ? "Marca lo que se tocó en esta junta — lo que no marques sigue pendiente la próxima vez."
          : "Solo lectura — actívala para poder marcar avances."}
      </p>
      {agenda.length === 0 && (
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
          Esta junta todavía no tiene ítems en su agenda.
        </p>
      )}
      {raices.map((grupo) => (
        <NodoSeccion
          key={grupo.id}
          grupo={grupo}
          hijosPorPadre={hijosPorPadre}
          reunionId={reunionId}
          onCambio={cargar}
          expandidos={expandidos}
          onToggle={toggle}
          nivel={0}
        />
      ))}
    </div>
  );
}

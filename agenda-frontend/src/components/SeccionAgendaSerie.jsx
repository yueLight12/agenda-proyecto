import { useEffect, useState } from "react";
import { minutasApi, seriesReunionApi } from "../api/endpoints";

const ETIQUETAS_ESTADO = {
  revisado: "revisado",
  pendiente: "pendiente",
  revisado_con_pendientes: "revisado, con pendientes nuevos",
};

function ItemAgenda({ item, reunionId, onCambio }) {
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
        onClick={() => setAbierto((a) => !a)}
        aria-expanded={abierto}
      >
        <span style={{ fontSize: "0.88rem" }}>{item.nombre}</span>
        <span style={{ fontSize: "0.78rem", color: "var(--color-text-muted)" }}>
          {ETIQUETAS_ESTADO[item.estado_actual] || item.estado_actual} {abierto ? "▲" : "▼"}
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

      {abierto && (
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

/**
 * Sección "Agenda de esta reunión" dentro de ModalMinuta -- solo aparece si
 * la reunión es una ocurrencia de una serie recurrente (reunion.serie_id).
 * Muestra la agenda persistente de la serie con el estado de cada ítem
 * (Fase 2/3, 2026-08-17): lo no revisado sigue apareciendo pendiente de
 * ocurrencia en ocurrencia -- no hay ningún "reseteo", el estado siempre es
 * el de la última vez que se marcó.
 */
export default function SeccionAgendaSerie({ serieId, reunionId }) {
  const [agenda, setAgenda] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const cargar = () =>
    seriesReunionApi
      .agenda(serieId)
      .then(setAgenda)
      .catch(() => setError("No se pudo cargar la agenda de esta junta."))
      .finally(() => setCargando(false));

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serieId]);

  if (cargando) return <p style={{ fontSize: "0.85rem" }}>Cargando agenda...</p>;
  if (error) return <p className="error-text">{error}</p>;

  // Mismo agrupado por sección que ModalSerieReunion.jsx -- un punto sin
  // seccion_proyecto_id cae en "General".
  const grupos = [];
  const indicePorSeccion = {};
  agenda.forEach((it) => {
    const clave = it.seccion_proyecto_id || "general";
    if (!(clave in indicePorSeccion)) {
      indicePorSeccion[clave] = grupos.length;
      grupos.push({ nombre: it.seccion_nombre || "General", items: [] });
    }
    grupos[indicePorSeccion[clave]].items.push(it);
  });

  return (
    <div className="stack" style={{ gap: 6 }}>
      <p style={{ color: "var(--color-text-muted)", fontSize: "0.78rem", margin: 0 }}>
        Marca lo que se tocó en esta junta — lo que no marques sigue pendiente la próxima vez.
      </p>
      {agenda.length === 0 && (
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
          Esta junta todavía no tiene ítems en su agenda.
        </p>
      )}
      {grupos.map((grupo) => (
        <div key={grupo.nombre} className="stack" style={{ gap: 4 }}>
          <h4 style={{ fontSize: "0.8rem", margin: "6px 0 0", color: "var(--color-text-muted)" }}>
            {grupo.nombre}
          </h4>
          {grupo.items.map((item) => (
            <ItemAgenda key={item.id} item={item} reunionId={reunionId} onCambio={cargar} />
          ))}
        </div>
      ))}
    </div>
  );
}

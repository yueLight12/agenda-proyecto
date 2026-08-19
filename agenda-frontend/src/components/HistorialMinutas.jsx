import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { equipoResumenApi, seriesReunionApi } from "../api/endpoints";
import { semanaActual, textoRangoSemana } from "../utils/fechas";

// Solo primera letra en mayúscula -- mismo criterio que
// KanbanSupervisores.jsx (copiado en vez de importado, es un one-liner y
// evita acoplar dos componentes que por lo demás no se relacionan).
function primeraMayuscula(texto) {
  if (!texto) return texto;
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

const ETIQUETA_ESTADO = {
  revisado: "Revisado",
  revisado_con_pendientes: "Revisado, con pendientes nuevos",
  pendiente: "Sigue pendiente",
};

// YYYY-MM-DD en horario LOCAL (no toISOString, que corta en UTC y puede
// mandar el día equivocado del otro lado de medianoche). Exportada
// (2026-08-19) -- ResumenEquipo.jsx la reutiliza para la navegación
// ◀/▶ entre semanas embebida directo en Seguimiento (ver
// ContenidoHistorialSemana más abajo).
export function fechaIsoLocal(fecha) {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, "0");
  const d = String(fecha.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// `onRevertido` (2026-08-18, a petición de Yue: "si un tema se marcó
// revisado por error, ¿cómo se revierte?") -- solo se pasa para la sección
// "Revisado esta semana", donde cada fila trae `agenda_item_id`. Vuelve a
// dejar el tema pendiente en su junta original (mismo mecanismo que
// "+ Agregar tema a esta agenda" en SeccionAgendaChecklist) sin borrar
// este registro histórico -- por eso la fila se queda en la lista tal cual
// hasta que se recargue la semana.
function Fila({ evento, onRevertido }) {
  const [revirtiendo, setRevirtiendo] = useState(false);
  const [error, setError] = useState("");

  const handleRevertir = async () => {
    setRevirtiendo(true);
    setError("");
    try {
      await seriesReunionApi.revertirRevisado(evento.agenda_item_id);
      await onRevertido();
    } catch (err) {
      setError(err.response?.data?.detail || "No se pudo revertir.");
      setRevirtiendo(false);
    }
  };

  return (
    <div style={{ padding: "8px 0", borderBottom: "1px solid var(--color-border)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <strong>{evento.tema_nombre}</strong>
        <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
          {evento.junta_titulo}
        </span>
      </div>
      {(evento.usuario_nombre || evento.estado) && (
        <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span>
            {evento.usuario_nombre && `${evento.usuario_nombre} — `}
            {ETIQUETA_ESTADO[evento.estado] || ""}
          </span>
          {onRevertido && evento.agenda_item_id != null && (
            <button
              type="button"
              className="btn btn--ghost"
              style={{ fontSize: "0.72rem", padding: "2px 8px", whiteSpace: "nowrap" }}
              onClick={handleRevertir}
              disabled={revirtiendo}
            >
              {revirtiendo ? "Revirtiendo..." : "↩ Revertir"}
            </button>
          )}
        </div>
      )}
      {evento.nota && (
        <div style={{ fontSize: "0.85rem", marginTop: 4 }}>
          <em>&ldquo;{evento.nota}&rdquo;</em>
        </div>
      )}
      {error && <p className="error-text" style={{ fontSize: "0.78rem", margin: "4px 0 0" }}>{error}</p>}
    </div>
  );
}

function Seccion({ titulo, eventos, vacio, onRevertido }) {
  return (
    <div className="card" style={{ marginTop: 12 }}>
      <h3 style={{ marginTop: 0 }}>{titulo}</h3>
      {eventos.length === 0 ? (
        <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>{vacio}</p>
      ) : (
        eventos.map((e, i) => <Fila key={i} evento={e} onRevertido={onRevertido} />)
      )}
    </div>
  );
}

// Contenido de solo lectura de una semana (sin encabezado ni navegación
// propia) -- extraído de HistorialMinutas (2026-08-19, a petición de Yue:
// "ya tenemos la plantilla de minuta aquí en esta vista, ¿por qué no
// agregamos botones de anterior/siguiente para movernos entre las minutas
// pasadas?" en vez de una pestaña Historial aparte). ResumenEquipo.jsx lo
// usa directo cuando navega a una semana que no es la actual; la pestaña
// Historial (oculta) sigue funcionando igual, ahora sobre este mismo
// componente con su propia navegación.
export function ContenidoHistorialSemana({ fecha }) {
  const [historial, setHistorial] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const cargar = () => {
    setCargando(true);
    setError("");
    return equipoResumenApi
      .historialSemana(fecha)
      .then(setHistorial)
      .catch(() => setError("No se pudo cargar el historial de esta semana."))
      .finally(() => setCargando(false));
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fecha]);

  if (cargando) return <p>Cargando...</p>;
  if (error) return <p className="error-text">{error}</p>;
  if (!historial) return null;

  return (
    <div className="stack">
      <Seccion
        titulo={`Revisado esta semana (${historial.revisados.length})`}
        eventos={historial.revisados}
        vacio="Nada revisado esta semana."
        onRevertido={cargar}
      />
      <Seccion
        titulo={`Nuevo esta semana (${historial.nuevos.length})`}
        eventos={historial.nuevos}
        vacio="Nada nuevo esta semana."
      />
      <Seccion
        titulo={`Sigue pendiente (${historial.pendientes.length})`}
        eventos={historial.pendientes}
        vacio="Nada pendiente al cierre de esta semana."
      />
    </div>
  );
}

// Vista alterna de la misma semana, formato tabla en vez de las 3
// secciones de arriba (2026-08-19, a petición de Yue: "quiero probar una
// vista diferente... mostrar todo como en la minuta actual, con los temas
// que se vieron, los que quedaron como revisados"). Mismo look que la
// tabla en vivo de Vista Equipo (clase .tabla-temas), pero SOLO columnas
// Tema/Status -- Prioridad y Accionables no tienen un valor histórico real
// por semana (son el orden/las notas de HOY, no de esa semana), así que
// mezclarlos aquí sería engañoso. Sin botones de editar/mover/marcar: es
// historial de solo lectura, igual que ContenidoHistorialSemana.
export function TablaHistorialSemana({ fecha }) {
  const [historial, setHistorial] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setCargando(true);
    setError("");
    equipoResumenApi
      .historialSemana(fecha)
      .then(setHistorial)
      .catch(() => setError("No se pudo cargar el historial de esta semana."))
      .finally(() => setCargando(false));
  }, [fecha]);

  if (cargando) return <p>Cargando...</p>;
  if (error) return <p className="error-text">{error}</p>;
  if (!historial) return null;

  // Un tema puede aparecer en más de una lista a la vez (ej. se creó Y se
  // revisó la misma semana) -- una sola fila por proyecto_id, revisados
  // manda sobre pendientes/nuevos si hay conflicto. Ignora filas sin
  // proyecto_id (accionables sueltos de la agenda, no son "temas").
  const filas = new Map();
  for (const ev of [...historial.pendientes, ...historial.nuevos]) {
    if (ev.proyecto_id == null) continue;
    filas.set(ev.proyecto_id, { proyecto_id: ev.proyecto_id, nombre: ev.tema_nombre, status: "pendiente" });
  }
  for (const ev of historial.revisados) {
    if (ev.proyecto_id == null) continue;
    filas.set(ev.proyecto_id, { proyecto_id: ev.proyecto_id, nombre: ev.tema_nombre, status: "revisado" });
  }

  // Mismo criterio que la tabla en vivo: pendientes primero, revisados al
  // fondo (ver comparador en construirArbol, KanbanSupervisores.jsx).
  const lista = Array.from(filas.values()).sort((a, b) => {
    if (a.status !== b.status) return a.status === "revisado" ? 1 : -1;
    return a.nombre.localeCompare(b.nombre);
  });

  if (lista.length === 0) {
    return (
      <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
        Sin temas relevantes esta semana.
      </p>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="tabla-temas">
        <thead>
          <tr>
            <th>Tema</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {lista.map((f) => (
            <tr key={f.proyecto_id} className="tabla-temas__fila">
              <td>
                <Link
                  to={`/proyectos/${f.proyecto_id}`}
                  style={{ color: "inherit", textDecoration: "none", fontWeight: 600 }}
                >
                  {primeraMayuscula(f.nombre)}
                </Link>
              </td>
              <td>
                <span
                  style={{
                    fontWeight: 600,
                    fontSize: "0.68rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.02em",
                    padding: "2px 8px",
                    borderRadius: 999,
                    whiteSpace: "nowrap",
                    color: f.status === "pendiente" ? "var(--color-warning)" : "var(--color-teal-600)",
                    background: f.status === "pendiente" ? "var(--color-warning-bg, #FBEFD9)" : "var(--color-success-bg)",
                  }}
                >
                  {f.status === "pendiente" ? "Pendiente" : "Revisado"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function HistorialMinutas() {
  const [fechaRef, setFechaRef] = useState(new Date());
  const semana = semanaActual(fechaRef);

  const cambiarSemana = (delta) => {
    const siguiente = new Date(fechaRef);
    siguiente.setDate(siguiente.getDate() + delta * 7);
    setFechaRef(siguiente);
  };

  return (
    <div className="stack">
      <div className="topbar">
        <h2 style={{ margin: 0 }}>Minuta — Semana {semana.numero}</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="btn btn--ghost" type="button" onClick={() => cambiarSemana(-1)}>
            ◀
          </button>
          <span style={{ fontSize: "0.9rem", color: "var(--color-text-muted)" }}>
            {textoRangoSemana(semana)}
          </span>
          <button className="btn btn--ghost" type="button" onClick={() => cambiarSemana(1)}>
            ▶
          </button>
        </div>
      </div>

      <ContenidoHistorialSemana fecha={fechaIsoLocal(fechaRef)} />
    </div>
  );
}

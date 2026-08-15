import { useState } from "react";
import { Link } from "react-router-dom";
import { entregablesApi, proyectosApi, reunionesApi } from "../api/endpoints";
import { fechaLocal, textoDiasRelativos } from "../utils/fechas";
import { etiquetaRol } from "../utils/rolLabels";

// "Tus proyectos" en tarjetas Kanban: una columna por PROYECTO (no por rol,
// como antes) — al desplegar una columna se ve el equipo de ese proyecto en
// una lista plana, y cada persona se despliega a su vez para ver sus
// entregables/reuniones ahí. Mismo patrón visual que KanbanEquipoProyecto
// (Administrar equipo del proyecto), solo que sin agrupar por supervisor —
// aquí el nivel de agrupación ya es el proyecto en sí.
//
// El equipo/entregables/reuniones de cada proyecto se cargan solo cuando se
// despliega esa columna por primera vez (no de entrada para las N
// columnas), para no disparar 3×N llamadas a la API con solo abrir la
// página.
function DetalleMiembro({ usuarioId, entregables, reuniones }) {
  const hoyIso = new Date().toISOString().slice(0, 10);
  const susEntregables = entregables.filter((e) => e.responsable_id === usuarioId);
  const susReuniones = reuniones.filter(
    (r) => r.organizador_id === usuarioId || r.participantes?.some((p) => p.usuario_id === usuarioId)
  );

  if (susEntregables.length === 0 && susReuniones.length === 0) {
    return (
      <p style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", margin: "4px 0 0" }}>
        Sin entregables ni reuniones en este proyecto.
      </p>
    );
  }

  return (
    <div className="stack" style={{ gap: 4, padding: "4px 0 0 12px" }}>
      {susEntregables.map((e) => {
        const vencido = e.estatus !== "cumplido" && e.fecha_entrega < hoyIso;
        return (
          <div
            key={`entregable-${e.id}`}
            style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: "0.8rem" }}
          >
            <span>
              {vencido && "🔴 "}
              {e.nombre}
            </span>
            <span style={{ color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
              {fechaLocal(e.fecha_entrega).toLocaleDateString("es-MX", { dateStyle: "short" })} ·{" "}
              {textoDiasRelativos(e.fecha_entrega)}
            </span>
          </div>
        );
      })}
      {susReuniones.map((r) => (
        <div
          key={`reunion-${r.id}`}
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 8,
            fontSize: "0.8rem",
            color: "var(--color-text-muted)",
          }}
        >
          <span>🗓️ {r.titulo}</span>
          <span style={{ whiteSpace: "nowrap" }}>
            {new Date(r.fecha_inicio).toLocaleDateString("es-MX", { dateStyle: "short" })}
          </span>
        </div>
      ))}
    </div>
  );
}

function TarjetaMiembro({ miembro, entregables, reuniones }) {
  const [abierta, setAbierta] = useState(false);

  return (
    <div className="kanban-card" style={{ cursor: "default" }}>
      <button
        type="button"
        className="list-inline list-inline--boton"
        style={{ padding: 0 }}
        onClick={() => setAbierta((actual) => !actual)}
        aria-expanded={abierta}
      >
        <div className="kanban-card__titulo">{miembro.nombre}</div>
        <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
          {etiquetaRol(miembro.rol)} {abierta ? "▲" : "▼"}
        </span>
      </button>
      {miembro.puesto && (
        <div style={{ fontSize: "0.78rem", color: "var(--color-text-muted)" }}>{miembro.puesto}</div>
      )}
      {abierta && (
        <DetalleMiembro usuarioId={miembro.usuario_id} entregables={entregables} reuniones={reuniones} />
      )}
    </div>
  );
}

function TarjetaProyecto({ proyecto, rol, esN1, onEditar, onEliminar }) {
  const [abierto, setAbierto] = useState(false);
  const [cargado, setCargado] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [equipo, setEquipo] = useState([]);
  const [entregables, setEntregables] = useState([]);
  const [reuniones, setReuniones] = useState([]);

  const toggle = async () => {
    const siguiente = !abierto;
    setAbierto(siguiente);
    if (!siguiente || cargado) return;

    setCargando(true);
    setError("");
    try {
      const [eq, ent, reu] = await Promise.all([
        proyectosApi.equipo(proyecto.id),
        entregablesApi.listarPorProyecto(proyecto.id),
        reunionesApi.listarPorProyecto(proyecto.id),
      ]);
      setEquipo(eq);
      setEntregables(ent);
      setReuniones(reu);
      setCargado(true);
    } catch {
      setError("No se pudo cargar el equipo de este proyecto.");
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="kanban-column">
      <div className="kanban-column__header">
        <Link to={`/proyectos/${proyecto.id}`} style={{ color: "inherit", textDecoration: "none" }}>
          {proyecto.nombre}
        </Link>
        {esN1 && (
          <div style={{ display: "flex", gap: 6 }}>
            <button
              className="btn btn--ghost"
              type="button"
              style={{ fontSize: "0.72rem", padding: "2px 6px" }}
              onClick={() => onEditar(proyecto)}
            >
              Editar
            </button>
            <button
              className="btn btn--ghost"
              type="button"
              style={{ fontSize: "0.72rem", padding: "2px 6px" }}
              onClick={() => onEliminar(proyecto)}
            >
              Eliminar
            </button>
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {rol && (
          <span className="kanban-column__contador" style={{ fontSize: "0.7rem" }}>
            {etiquetaRol(rol)}
          </span>
        )}
        {!proyecto.activo && (
          <span className="badge" style={{ fontSize: "0.7rem" }}>
            Inactivo
          </span>
        )}
      </div>

      {proyecto.descripcion && (
        <p style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", margin: 0 }}>
          {proyecto.descripcion}
        </p>
      )}

      <button
        type="button"
        className="btn btn--ghost"
        style={{ alignSelf: "flex-start", fontSize: "0.8rem" }}
        onClick={toggle}
      >
        {abierto ? "Ocultar equipo ▲" : "Ver equipo ▼"}
      </button>

      {abierto && (
        <div className="kanban-column__lista">
          {cargando && <p style={{ fontSize: "0.8rem" }}>Cargando...</p>}
          {error && (
            <p className="error-text" style={{ fontSize: "0.8rem" }}>
              {error}
            </p>
          )}
          {cargado && equipo.length === 0 && (
            <p style={{ color: "var(--color-text-muted)", fontSize: "0.8rem" }}>
              Sin miembros visibles para ti en este proyecto.
            </p>
          )}
          {cargado &&
            equipo.map((m) => (
              <TarjetaMiembro key={m.usuario_id} miembro={m} entregables={entregables} reuniones={reuniones} />
            ))}
        </div>
      )}
    </div>
  );
}

export default function KanbanMisProyectos({ proyectos, rolDeProyecto, esN1DelProyecto, onEditar, onEliminar }) {
  if (proyectos.length === 0) {
    return (
      <p style={{ color: "var(--color-text-muted)" }}>No tienes proyectos asignados todavía.</p>
    );
  }

  return (
    <div className="kanban-responsive">
      <div className="kanban-board">
        {proyectos.map((p) => (
          <TarjetaProyecto
            key={p.id}
            proyecto={p}
            rol={rolDeProyecto(p.id)}
            esN1={esN1DelProyecto(p.id)}
            onEditar={onEditar}
            onEliminar={onEliminar}
          />
        ))}
      </div>
    </div>
  );
}

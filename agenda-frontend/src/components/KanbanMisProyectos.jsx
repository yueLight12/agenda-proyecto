import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { entregablesApi, proyectosApi, reunionesApi } from "../api/endpoints";
import { fechaLocal, textoDiasRelativos } from "../utils/fechas";
import { etiquetaRol } from "../utils/rolLabels";

// "Tus temas" en tarjetas Kanban: una columna por tema RAÍZ -- al desplegar
// una columna se ve el equipo de ese tema en una lista plana, cada persona
// se despliega a su vez para ver sus entregables/reuniones ahí, y debajo
// del equipo se listan sus SUBTEMAS (recursivo a cualquier profundidad),
// cada uno con su propio equipo -- pedido explícito de Yue, 2026-08-17:
// "en tus temas se desplieguen los temas y subtemas con las personas
// asignadas". Mismo patrón visual que KanbanEquipoProyecto (Administrar
// equipo del tema), solo que sin agrupar por supervisor -- aquí el nivel
// de agrupación ya es el tema/subtema en sí.
//
// El equipo/entregables/reuniones de cada nodo se cargan solo cuando se
// despliega esa columna por primera vez (no de entrada para las N
// columnas), para no disparar llamadas de más con solo abrir la página.
// entregablesApi/reunionesApi.listarPorProyecto ya traen en cascada TODO
// el subárbol (ver Fase 1 de jerarquía, 2026-08-16) -- por eso solo se
// piden una vez, en la raíz, y de ahí para abajo cada nodo filtra por su
// propio proyecto_id en vez de volver a pedirlos.
function DetalleMiembro({ usuarioId, proyectoId, entregables, reuniones }) {
  const hoyIso = new Date().toISOString().slice(0, 10);
  const susEntregables = entregables.filter(
    (e) => e.responsable_id === usuarioId && e.proyecto_id === proyectoId
  );
  const susReuniones = reuniones.filter(
    (r) =>
      r.proyecto_id === proyectoId &&
      (r.organizador_id === usuarioId || r.participantes?.some((p) => p.usuario_id === usuarioId))
  );

  if (susEntregables.length === 0 && susReuniones.length === 0) {
    return (
      <p style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", margin: "4px 0 0" }}>
        Sin entregables ni reuniones en este tema.
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

function TarjetaMiembro({ miembro, proyectoId, entregables, reuniones }) {
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
        <DetalleMiembro
          usuarioId={miembro.usuario_id}
          proyectoId={proyectoId}
          entregables={entregables}
          reuniones={reuniones}
        />
      )}
    </div>
  );
}

// Nodo de subtema, recursivo: se muestra directamente (sin toggle propio,
// ya se necesitó un clic para llegar hasta acá) con su equipo y, debajo,
// sus propios subtemas -- a cualquier profundidad.
function NodoSubtema({ proyecto, entregablesSubarbol, reunionesSubarbol }) {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [equipo, setEquipo] = useState([]);
  const [hijos, setHijos] = useState([]);

  useEffect(() => {
    let activo = true;
    setCargando(true);
    setError("");
    Promise.all([proyectosApi.equipo(proyecto.id), proyectosApi.hijos(proyecto.id)])
      .then(([eq, h]) => {
        if (!activo) return;
        setEquipo(eq);
        setHijos(h);
      })
      .catch(() => activo && setError("No se pudo cargar este subtema."))
      .finally(() => activo && setCargando(false));
    return () => {
      activo = false;
    };
  }, [proyecto.id]);

  return (
    <div style={{ marginLeft: 14, borderLeft: "2px solid var(--color-border)", paddingLeft: 10, marginTop: 6 }}>
      <div style={{ fontSize: "0.82rem" }}>
        <Link to={`/proyectos/${proyecto.id}`} style={{ color: "inherit", fontWeight: 600 }}>
          {proyecto.nombre}
        </Link>{" "}
        <span style={{ fontWeight: 400, color: "var(--color-text-muted)" }}>(subtema)</span>
      </div>
      {cargando && <p style={{ fontSize: "0.78rem" }}>Cargando...</p>}
      {error && (
        <p className="error-text" style={{ fontSize: "0.78rem" }}>
          {error}
        </p>
      )}
      {!cargando && !error && equipo.length === 0 && (
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.78rem" }}>
          Sin miembros visibles para ti en este subtema.
        </p>
      )}
      {!cargando &&
        equipo.map((m) => (
          <TarjetaMiembro
            key={m.usuario_id}
            miembro={m}
            proyectoId={proyecto.id}
            entregables={entregablesSubarbol}
            reuniones={reunionesSubarbol}
          />
        ))}
      {hijos.map((h) => (
        <NodoSubtema
          key={h.id}
          proyecto={h}
          entregablesSubarbol={entregablesSubarbol}
          reunionesSubarbol={reunionesSubarbol}
        />
      ))}
    </div>
  );
}

function TarjetaProyecto({ proyecto, onEditar, onEliminar }) {
  const rol = proyecto.rol_efectivo;
  const puedeAdministrar = proyecto.puede_administrar;
  const [abierto, setAbierto] = useState(false);
  const [cargado, setCargado] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [equipo, setEquipo] = useState([]);
  const [entregables, setEntregables] = useState([]);
  const [reuniones, setReuniones] = useState([]);
  const [subtemas, setSubtemas] = useState([]);

  const toggle = async () => {
    const siguiente = !abierto;
    setAbierto(siguiente);
    if (!siguiente || cargado) return;

    setCargando(true);
    setError("");
    try {
      const [eq, ent, reu, hijos] = await Promise.all([
        proyectosApi.equipo(proyecto.id),
        entregablesApi.listarPorProyecto(proyecto.id),
        reunionesApi.listarPorProyecto(proyecto.id),
        proyectosApi.hijos(proyecto.id),
      ]);
      setEquipo(eq);
      setEntregables(ent);
      setReuniones(reu);
      setSubtemas(hijos);
      setCargado(true);
    } catch {
      setError("No se pudo cargar el equipo de este tema.");
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
        {puedeAdministrar && (
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
        {proyecto.tiene_hijos && (
          <span style={{ fontSize: "0.7rem", color: "var(--color-text-muted)" }}>tiene subtemas</span>
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
              Sin miembros visibles para ti en este tema.
            </p>
          )}
          {cargado &&
            equipo.map((m) => (
              <TarjetaMiembro
                key={m.usuario_id}
                miembro={m}
                proyectoId={proyecto.id}
                entregables={entregables}
                reuniones={reuniones}
              />
            ))}
          {cargado &&
            subtemas.map((s) => (
              <NodoSubtema
                key={s.id}
                proyecto={s}
                entregablesSubarbol={entregables}
                reunionesSubarbol={reuniones}
              />
            ))}
        </div>
      )}
    </div>
  );
}

export default function KanbanMisProyectos({ proyectos, onEditar, onEliminar }) {
  if (proyectos.length === 0) {
    return (
      <p style={{ color: "var(--color-text-muted)" }}>No tienes temas asignados todavía.</p>
    );
  }

  return (
    <div className="kanban-responsive">
      <div className="kanban-board">
        {proyectos.map((p) => (
          <TarjetaProyecto key={p.id} proyecto={p} onEditar={onEditar} onEliminar={onEliminar} />
        ))}
      </div>
    </div>
  );
}

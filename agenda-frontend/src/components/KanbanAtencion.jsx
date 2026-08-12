import { Link } from "react-router-dom";

// Tablero Kanban (solo lectura, sin drag-and-drop) para "Requiere tu
// atención" en el Resumen general — alternativa visual a la lista
// colapsable que tenía antes DashboardSimplificado.jsx, para probar cómo se
// ve. Reutiliza las clases .kanban-* que ya existían para
// KanbanEntregables.jsx (tablero de un proyecto); a diferencia de ese, aquí
// no hay una acción natural de "arrastrar para cambiar estatus" porque las
// columnas mezclan entregables, reuniones y cumpleaños, así que las
// tarjetas son de solo lectura.

// `fecha_entrega` llega como "YYYY-MM-DD" — se arma con componentes locales
// (no `new Date(fecha)` directo) para no perder un día por el corrimiento a
// UTC, mismo criterio que ya usa el cálculo de cumpleaños próximos.
function fechaLocal(fechaIso) {
  const [anio, mes, dia] = fechaIso.split("-").map(Number);
  return new Date(anio, mes - 1, dia);
}

function textoDiasRelativos(fechaIso) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const diffDias = Math.round((fechaLocal(fechaIso) - hoy) / (1000 * 60 * 60 * 24));
  if (diffDias === 0) return "hoy";
  if (diffDias > 0) return `en ${diffDias} día${diffDias === 1 ? "" : "s"}`;
  const dias = -diffDias;
  return `hace ${dias} día${dias === 1 ? "" : "s"}`;
}

function TarjetaEntregable({ entregable, prefijoVencido }) {
  return (
    <Link
      to={`/proyectos/${entregable.proyecto_id}`}
      className="kanban-card"
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <div className="kanban-card__titulo">{entregable.nombre}</div>
      <div className="kanban-card__meta">
        <span>{entregable.proyecto_nombre}</span>
        <span>{entregable.responsable_nombre}</span>
      </div>
      <div className="kanban-card__meta">
        <span>
          {prefijoVencido} el{" "}
          {fechaLocal(entregable.fecha_entrega).toLocaleDateString("es-MX", { dateStyle: "medium" })}
          {" · "}
          {textoDiasRelativos(entregable.fecha_entrega)}
        </span>
      </div>
    </Link>
  );
}

function TarjetaReunion({ reunion }) {
  return (
    <div className="kanban-card">
      <div className="kanban-card__titulo">{reunion.titulo}</div>
      <div className="kanban-card__meta">
        <span>{reunion.proyecto_nombre}</span>
        <span>{reunion.organizador_nombre}</span>
      </div>
      <div className="kanban-card__meta">
        <span>{new Date(reunion.fecha_inicio).toLocaleTimeString("es-MX", { timeStyle: "short" })}</span>
      </div>
    </div>
  );
}

function TarjetaCumpleanos({ cumpleanos }) {
  return (
    <div className="kanban-card">
      <div className="kanban-card__titulo">{cumpleanos.nombre}</div>
      <div className="kanban-card__meta">
        <span>
          {new Date(cumpleanos.fecha + "T00:00:00").toLocaleDateString("es-MX", { dateStyle: "medium" })}
        </span>
      </div>
    </div>
  );
}

const COLUMNAS = [
  { clave: "vencidos", icono: "🔴", titulo: "Vencidos" },
  { clave: "reunionesHoy", icono: "🟡", titulo: "Reuniones hoy" },
  { clave: "proximos", icono: "🟡", titulo: "Por vencer" },
  { clave: "cumpleanos", icono: "🎂", titulo: "Cumpleaños" },
];

export default function KanbanAtencion({ vencidos, proximos, reunionesHoy, cumpleanosProximos }) {
  const datosPorColumna = {
    vencidos,
    reunionesHoy,
    proximos,
    cumpleanos: cumpleanosProximos,
  };

  const totalItems = vencidos.length + proximos.length + reunionesHoy.length + cumpleanosProximos.length;

  if (totalItems === 0) {
    return (
      <p style={{ color: "var(--color-text-muted)" }}>
        Nada urgente por ahora — todo al día.
      </p>
    );
  }

  return (
    <div className="kanban-responsive">
      <div className="kanban-board">
        {COLUMNAS.map((columna) => {
          const items = datosPorColumna[columna.clave];
          return (
            <div key={columna.clave} className="kanban-column">
              <div className="kanban-column__header">
                <span>
                  {columna.icono} {columna.titulo}
                </span>
                <span className="kanban-column__contador">{items.length}</span>
              </div>
              <div className="kanban-column__lista">
                {items.length === 0 && <p className="kanban-column__vacio">Sin pendientes aquí.</p>}
                {columna.clave === "vencidos" &&
                  items.map((e) => (
                    <TarjetaEntregable key={`entregable-${e.id}`} entregable={e} prefijoVencido="vencido" />
                  ))}
                {columna.clave === "proximos" &&
                  items.map((e) => (
                    <TarjetaEntregable key={`entregable-${e.id}`} entregable={e} prefijoVencido="vence" />
                  ))}
                {columna.clave === "reunionesHoy" &&
                  items.map((r) => <TarjetaReunion key={`reunion-${r.id}`} reunion={r} />)}
                {columna.clave === "cumpleanos" &&
                  items.map((c) => <TarjetaCumpleanos key={`cumpleanos-${c.id}`} cumpleanos={c} />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

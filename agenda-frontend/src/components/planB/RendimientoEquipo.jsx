import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { proyectosApi, rendimientoApi } from "../../api/endpoints";

// Dashboard visual de rendimiento (2026-08-26, a petición de Yue: "los
// usuarios que lo van a utilizar son más de gráficas... se requiere un
// dashboard que sirva para monitorear personas, proyectos y tareas" -- la
// primera versión de esta pantalla era solo una tabla, no bastaba). Sin
// lógica de permisos propia -- el backend (app/services/rendimiento.py) ya
// agrega sobre el mismo conjunto de entregables que el usuario actual
// puede ver.
//
// Colores: se reutilizan los tokens de estatus que YA existen en el resto
// del sistema (--color-success/--color-warning/--color-text-muted, ver
// EstatusBadge.jsx) en vez de inventar una paleta nueva -- así el donut de
// estatus se lee igual que los badges de cualquier tarjeta de entregable.
// Para las barras de magnitud (carga por proyecto, tendencia) se usa UN
// solo tono (teal) porque no hay una dimensión categórica que distinguir,
// solo una cantidad por barra -- evita el "rainbow" de colorear cada barra
// distinto sin que signifique nada.
const COLOR_CUMPLIDO = "var(--color-success)";
const COLOR_EN_PROGRESO = "var(--color-warning)";
const COLOR_PENDIENTE = "var(--color-text-muted)";
const COLOR_COMPLETADAS = "var(--color-teal-500)";
const COLOR_CARGA = "var(--color-warning)";
const COLOR_VENCIDAS = "var(--color-danger)";

const ESTILO_TOOLTIP = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  color: "var(--color-text)",
  fontSize: "0.85rem",
};

const PERIODOS = [
  { valor: "semana", etiqueta: "Esta semana" },
  { valor: "mes", etiqueta: "Este mes" },
  { valor: "todo", etiqueta: "Todo el historial" },
];

const COLUMNAS_TABLA = [
  { clave: "completadas", etiqueta: "Completadas" },
  { clave: "a_tiempo", etiqueta: "A tiempo" },
  { clave: "tarde", etiqueta: "Tarde" },
  { clave: "pendientes_actuales", etiqueta: "Carga actual" },
  { clave: "total_asignadas", etiqueta: "Total asignadas" },
  { clave: "asignadas_en_periodo", etiqueta: "Asignadas" },
  { clave: "vencidas", etiqueta: "Vencidas" },
  { clave: "dias_atraso_max", etiqueta: "Días atraso (máx)" },
  { clave: "dias_atraso_promedio", etiqueta: "Días atraso (prom)" },
  { clave: "proyectos", etiqueta: "Proyectos" },
];

// "Carga" se puede ver de dos formas (2026-08-27, a petición de Yue: "ambas
// con capacidad de elegir cuál quiero ver") -- activas ahora mismo, o el
// volumen total histórico asignado. Afecta la gráfica "Quién entrega más",
// no la tabla (la tabla ya muestra ambas columnas siempre).
const VISTAS_CARGA = [
  { valor: "pendientes_actuales", etiqueta: "Carga activa" },
  { valor: "total_asignadas", etiqueta: "Total asignadas" },
];

// Mostrar/ocultar métricas (2026-08-26, a petición de Yue: "al entrar
// mostramos todo tal cual, pero estaría bien poder ocultar o mostrar las
// métricas que quiera") -- se guarda por dispositivo en localStorage,
// mismo patrón que useEstiloPlanB.js/useTema.js. Todas visibles por
// default -- entrar la primera vez se ve exactamente igual que antes de
// este cambio.
const CLAVE_METRICAS_VISIBLES = "rendimiento_metricas_visibles";
const METRICAS = [
  { clave: "personas", etiqueta: "Quién entrega más" },
  { clave: "estatus", etiqueta: "Estatus de tareas" },
  { clave: "proyecto", etiqueta: "Carga por proyecto" },
  { clave: "tendencia", etiqueta: "Tendencia" },
  { clave: "vencidas", etiqueta: "Tareas vencidas" },
  { clave: "tabla", etiqueta: "Tabla" },
];
const METRICAS_DEFAULT = Object.fromEntries(METRICAS.map((m) => [m.clave, true]));

function cargarMetricasVisibles() {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE_METRICAS_VISIBLES));
    if (guardado && typeof guardado === "object") return { ...METRICAS_DEFAULT, ...guardado };
  } catch {
    // localStorage corrupto o inaccesible -- se queda con el default.
  }
  return { ...METRICAS_DEFAULT };
}

export default function RendimientoEquipo() {
  const [periodo, setPeriodo] = useState("mes");
  const [proyectos, setProyectos] = useState([]);
  const [proyectoId, setProyectoId] = useState("");
  const [busquedaPersona, setBusquedaPersona] = useState("");
  const [personas, setPersonas] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [orden, setOrden] = useState("completadas");
  const [vistaCarga, setVistaCarga] = useState("pendientes_actuales");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [metricasVisibles, setMetricasVisibles] = useState(cargarMetricasVisibles);

  const alternarMetrica = (clave) => {
    setMetricasVisibles((prev) => {
      const siguiente = { ...prev, [clave]: !prev[clave] };
      try {
        localStorage.setItem(CLAVE_METRICAS_VISIBLES, JSON.stringify(siguiente));
      } catch {
        // Privacidad estricta / cuota llena -- la preferencia solo dura la sesión.
      }
      return siguiente;
    });
  };

  // Lista de temas/subtemas para el filtro "buscar por proyecto" (2026-08-26,
  // a petición de Yue) -- se carga una sola vez, independiente del periodo.
  useEffect(() => {
    proyectosApi
      .arbolVisible()
      .then(setProyectos)
      .catch(() => setProyectos([]));
  }, []);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError("");
    const filtro = proyectoId ? Number(proyectoId) : undefined;
    Promise.all([
      rendimientoApi.obtener(periodo, filtro),
      rendimientoApi.obtenerResumen(filtro),
    ])
      .then(([datosPersonas, datosResumen]) => {
        if (cancelado) return;
        setPersonas(datosPersonas);
        setResumen(datosResumen);
      })
      .catch(() => {
        if (!cancelado) setError("No se pudo cargar el rendimiento del equipo.");
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [periodo, proyectoId]);

  const personasFiltradas = personas.filter((p) =>
    p.nombre.toLowerCase().includes(busquedaPersona.trim().toLowerCase())
  );
  const personasOrdenadas = [...personasFiltradas].sort((a, b) => b[orden] - a[orden]);

  const datosEstatus = resumen
    ? [
        { clave: "cumplido", nombre: "Cumplido", valor: resumen.por_estatus.cumplido, color: COLOR_CUMPLIDO },
        { clave: "en_progreso", nombre: "En progreso", valor: resumen.por_estatus.en_progreso, color: COLOR_EN_PROGRESO },
        { clave: "pendiente", nombre: "Pendiente", valor: resumen.por_estatus.pendiente, color: COLOR_PENDIENTE },
      ].filter((d) => d.valor > 0)
    : [];
  const totalEstatus = datosEstatus.reduce((acc, d) => acc + d.valor, 0);

  return (
    <div className="stack">
      <div className="planb__rendimiento-periodos" role="tablist" aria-label="Periodo">
        {PERIODOS.map((p) => (
          <button
            key={p.valor}
            type="button"
            className={`planb__rendimiento-periodo${periodo === p.valor ? " planb__rendimiento-periodo--activo" : ""}`}
            onClick={() => setPeriodo(p.valor)}
            aria-pressed={periodo === p.valor}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>

      <div className="planb__rendimiento-filtros">
        <select
          className="input"
          value={proyectoId}
          onChange={(e) => setProyectoId(e.target.value)}
          aria-label="Filtrar por proyecto"
        >
          <option value="">Todos los proyectos</option>
          {proyectos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.ruta}
            </option>
          ))}
        </select>
        <input
          className="input"
          type="search"
          placeholder="Buscar persona..."
          value={busquedaPersona}
          onChange={(e) => setBusquedaPersona(e.target.value)}
          aria-label="Buscar persona"
        />
      </div>

      <div className="planb__rendimiento-metricas" role="group" aria-label="Mostrar/ocultar métricas">
        {METRICAS.map((m) => (
          <label key={m.clave} className="planb__rendimiento-metrica-toggle">
            <input
              type="checkbox"
              checked={metricasVisibles[m.clave]}
              onChange={() => alternarMetrica(m.clave)}
            />
            {m.etiqueta}
          </label>
        ))}
      </div>

      {cargando && <p style={{ color: "var(--color-text-muted)" }}>Cargando...</p>}
      {error && !cargando && <p className="error-text">{error}</p>}

      {!cargando && !error && personas.length === 0 && (
        <p style={{ color: "var(--color-text-muted)" }}>Sin datos para este periodo/proyecto.</p>
      )}

      {!cargando && !error && personas.length > 0 && personasFiltradas.length === 0 && (
        <p style={{ color: "var(--color-text-muted)" }}>Nadie coincide con "{busquedaPersona}".</p>
      )}

      {!cargando && !error && personasFiltradas.length > 0 && (
        <>
          {metricasVisibles.personas && (
            <div className="planb__rendimiento-grafica-card">
              <div className="planb__rendimiento-grafica-encabezado">
                <h3 className="planb__rendimiento-grafica-titulo">
                  Quién entrega más — Completadas vs. carga
                </h3>
                <div className="planb__rendimiento-periodos" role="tablist" aria-label="Vista de carga">
                  {VISTAS_CARGA.map((v) => (
                    <button
                      key={v.valor}
                      type="button"
                      className={`planb__rendimiento-periodo${vistaCarga === v.valor ? " planb__rendimiento-periodo--activo" : ""}`}
                      onClick={() => setVistaCarga(v.valor)}
                      aria-pressed={vistaCarga === v.valor}
                    >
                      {v.etiqueta}
                    </button>
                  ))}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={Math.max(180, personasOrdenadas.length * 44)}>
                <BarChart data={personasOrdenadas} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} stroke="var(--color-text-muted)" fontSize={12} />
                  <YAxis
                    type="category"
                    dataKey="nombre"
                    width={140}
                    stroke="var(--color-text-muted)"
                    fontSize={12}
                  />
                  <Tooltip contentStyle={ESTILO_TOOLTIP} cursor={{ fill: "var(--color-border)", opacity: 0.3 }} />
                  <Legend wrapperStyle={{ fontSize: "0.8rem" }} />
                  <Bar dataKey="completadas" name="Completadas" fill={COLOR_COMPLETADAS} radius={[0, 4, 4, 0]} />
                  <Bar
                    dataKey={vistaCarga}
                    name={VISTAS_CARGA.find((v) => v.valor === vistaCarga).etiqueta}
                    fill={COLOR_CARGA}
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {metricasVisibles.vencidas && (
            <div className="planb__rendimiento-grafica-card">
              <h3 className="planb__rendimiento-grafica-titulo">Tareas vencidas por persona</h3>
              {personasOrdenadas.every((p) => p.vencidas === 0) ? (
                <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
                  Nadie tiene tareas vencidas.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(180, personasOrdenadas.length * 44)}>
                  <BarChart
                    data={[...personasOrdenadas].sort((a, b) => b.vencidas - a.vencidas)}
                    layout="vertical"
                    margin={{ left: 8, right: 16 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} stroke="var(--color-text-muted)" fontSize={12} />
                    <YAxis
                      type="category"
                      dataKey="nombre"
                      width={140}
                      stroke="var(--color-text-muted)"
                      fontSize={12}
                    />
                    <Tooltip
                      contentStyle={ESTILO_TOOLTIP}
                      cursor={{ fill: "var(--color-border)", opacity: 0.3 }}
                      formatter={(valor, nombre, item) =>
                        nombre === "Vencidas"
                          ? [`${valor} (máx. ${item.payload.dias_atraso_max} días de atraso)`, nombre]
                          : [valor, nombre]
                      }
                    />
                    <Bar dataKey="vencidas" name="Vencidas" fill={COLOR_VENCIDAS} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          )}

          {resumen && (metricasVisibles.estatus || metricasVisibles.proyecto || metricasVisibles.tendencia) && (
            <div className="planb__rendimiento-graficas-grid">
              {metricasVisibles.estatus && (
                <div className="planb__rendimiento-grafica-card">
                  <h3 className="planb__rendimiento-grafica-titulo">Estatus de tareas</h3>
                  {totalEstatus === 0 ? (
                    <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>Sin tareas visibles.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={datosEstatus}
                          dataKey="valor"
                          nameKey="nombre"
                          innerRadius={45}
                          outerRadius={75}
                          paddingAngle={2}
                        >
                          {datosEstatus.map((d) => (
                            <Cell key={d.clave} fill={d.color} stroke="var(--color-surface)" strokeWidth={2} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={ESTILO_TOOLTIP} />
                        <Legend wrapperStyle={{ fontSize: "0.8rem" }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              )}

              {metricasVisibles.proyecto && (
                <div className="planb__rendimiento-grafica-card">
                  <h3 className="planb__rendimiento-grafica-titulo">Carga por proyecto</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={resumen.por_proyecto} margin={{ left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                      <XAxis
                        dataKey="nombre"
                        stroke="var(--color-text-muted)"
                        fontSize={11}
                        interval={0}
                        angle={-25}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis allowDecimals={false} stroke="var(--color-text-muted)" fontSize={12} />
                      <Tooltip contentStyle={ESTILO_TOOLTIP} cursor={{ fill: "var(--color-border)", opacity: 0.3 }} />
                      <Bar dataKey="total" name="Tareas" fill={COLOR_COMPLETADAS} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {metricasVisibles.tendencia && (
                <div className="planb__rendimiento-grafica-card">
                  <h3 className="planb__rendimiento-grafica-titulo">Tendencia (últimas 8 semanas)</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={resumen.tendencia} margin={{ left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                      <XAxis dataKey="etiqueta" stroke="var(--color-text-muted)" fontSize={11} />
                      <YAxis allowDecimals={false} stroke="var(--color-text-muted)" fontSize={12} />
                      <Tooltip contentStyle={ESTILO_TOOLTIP} />
                      <Line
                        type="monotone"
                        dataKey="completadas"
                        name="Completadas"
                        stroke={COLOR_COMPLETADAS}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {metricasVisibles.tabla && (
            // Vista de tabla (accesibilidad -- mismos datos que la primera
            // gráfica, con todas las columnas para quien prefiera números
            // exactos u ordenar por otra métrica).
            <div style={{ overflowX: "auto" }}>
              <table className="planb__rendimiento-tabla">
                <thead>
                  <tr>
                    <th>Persona</th>
                    {COLUMNAS_TABLA.map((c) => (
                      <th key={c.clave}>
                        <button
                          type="button"
                          className="planb__rendimiento-columna-boton"
                          onClick={() => setOrden(c.clave)}
                          aria-pressed={orden === c.clave}
                          title={`Ordenar por ${c.etiqueta}`}
                        >
                          {c.etiqueta}
                          {orden === c.clave ? " ▾" : ""}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {personasOrdenadas.map((f) => (
                    <tr key={f.usuario_id}>
                      <td>{f.nombre}</td>
                      {COLUMNAS_TABLA.map((c) => (
                        <td key={c.clave}>{f[c.clave]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

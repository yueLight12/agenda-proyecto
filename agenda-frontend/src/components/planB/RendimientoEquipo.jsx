import { useEffect, useState } from "react";
import { rendimientoApi } from "../../api/endpoints";

// Tabla de métricas de desempeño por persona (2026-08-26, a petición de
// Yue: "Bernardo quiere saber quién trabaja más, quién entrega a tiempo,
// quién tiene más carga"). Sin lógica de permisos propia -- el backend
// (app/services/rendimiento.py) ya agrega sobre el mismo conjunto de
// entregables que el usuario actual puede ver, así que esta pantalla
// simplemente pinta lo que /rendimiento regresa.
const PERIODOS = [
  { valor: "semana", etiqueta: "Esta semana" },
  { valor: "mes", etiqueta: "Este mes" },
  { valor: "todo", etiqueta: "Todo el historial" },
];

const COLUMNAS = [
  { clave: "completadas", etiqueta: "Completadas" },
  { clave: "a_tiempo", etiqueta: "A tiempo" },
  { clave: "tarde", etiqueta: "Tarde" },
  { clave: "pendientes_actuales", etiqueta: "Carga actual" },
  { clave: "asignadas_en_periodo", etiqueta: "Asignadas" },
  { clave: "proyectos", etiqueta: "Proyectos" },
];

export default function RendimientoEquipo() {
  const [periodo, setPeriodo] = useState("mes");
  const [filas, setFilas] = useState([]);
  const [orden, setOrden] = useState("completadas");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError("");
    rendimientoApi
      .obtener(periodo)
      .then((data) => {
        if (!cancelado) setFilas(data);
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
  }, [periodo]);

  const filasOrdenadas = [...filas].sort((a, b) => b[orden] - a[orden]);

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

      {cargando && <p style={{ color: "var(--color-text-muted)" }}>Cargando...</p>}
      {error && !cargando && <p className="error-text">{error}</p>}
      {!cargando && !error && filas.length === 0 && (
        <p style={{ color: "var(--color-text-muted)" }}>Sin datos para este periodo.</p>
      )}

      {!cargando && !error && filas.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table className="planb__rendimiento-tabla">
            <thead>
              <tr>
                <th>Persona</th>
                {COLUMNAS.map((c) => (
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
              {filasOrdenadas.map((f) => (
                <tr key={f.usuario_id}>
                  <td>{f.nombre}</td>
                  {COLUMNAS.map((c) => (
                    <td key={c.clave}>{f[c.clave]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

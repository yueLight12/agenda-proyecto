import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { entregablesApi, proyectosApi, reunionesApi } from "../../api/endpoints";
import { useAuth } from "../../context/AuthContext";
import { fechaLocal } from "../../utils/fechas";

// Vista "Mi semana" de Agenda Plan B (2026-08-22, a petición de Yue: al
// hacer clic en la tarjeta activa de SelectorSemanaDestacado, en vez del
// resumen de temas de minuta (ContenidoHistorialSemana, que se queda para
// otro lugar) se muestran 2 columnas con lo mío de esa semana -- "Mi
// agenda" (mis reuniones, como organizador o invitado) y "Mis tareas" (mis
// entregables con fecha límite en la semana). Mismo patrón de agregación
// que ya usa CalendarioGlobal.jsx (proyectos raíz -> entregables/reuniones
// en cascada de todo el subárbol + reuniones generales) y el mismo filtro
// "personal" que ahí ya existe (responsable_id / organizador_id /
// participantes), para no duplicar la regla de qué es "mío" -- solo se le
// agrega el filtro de rango de fechas de la semana.
export default function MiSemana({ semana }) {
  const { usuario } = useAuth();
  const [entregables, setEntregables] = useState([]);
  const [reuniones, setReuniones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError("");
    (async () => {
      try {
        const raices = await proyectosApi.listar();
        const listasEntregables = await Promise.all(
          raices.map((p) => entregablesApi.listarPorProyecto(p.id))
        );
        const listasReuniones = await Promise.all(
          raices.map((p) => reunionesApi.listarPorProyecto(p.id))
        );
        const reunionesGenerales = await reunionesApi.listarGenerales();
        if (cancelado) return;
        setEntregables(listasEntregables.flat());
        setReuniones([...listasReuniones.flat(), ...reunionesGenerales]);
      } catch {
        if (!cancelado) setError("No se pudo cargar tu semana.");
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (cargando) return <p>Cargando tu semana...</p>;
  if (error) return <p className="error-text">{error}</p>;

  // `fin` es medianoche del domingo -- se compara hasta el final de ese día
  // (23:59:59.999) para no perder reuniones con hora avanzada el domingo.
  const finInclusive = new Date(semana.fin);
  finInclusive.setHours(23, 59, 59, 999);

  const tareas = entregables
    .filter((e) => e.responsable_id === usuario?.id)
    .filter((e) => {
      const f = fechaLocal(e.fecha_entrega);
      return f >= semana.inicio && f <= finInclusive;
    })
    .sort((a, b) => a.fecha_entrega.localeCompare(b.fecha_entrega));

  const agenda = reuniones
    .filter(
      (r) =>
        r.organizador_id === usuario?.id ||
        r.participantes?.some((p) => p.usuario_id === usuario?.id)
    )
    .filter((r) => {
      const f = new Date(r.fecha_inicio);
      return f >= semana.inicio && f <= finInclusive;
    })
    .sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio));

  return (
    <div className="planb__misemana">
      <div className="planb__misemana-col planb__misemana-col--tareas">
        <h3>Mis tareas</h3>
        {tareas.length === 0 ? (
          <p className="planb__misemana-vacio">Sin tareas con fecha esta semana.</p>
        ) : (
          <div className="stack" style={{ gap: 6 }}>
            {tareas.map((e) => (
              <Link
                key={e.id}
                to={`/app/proyectos/${e.proyecto_id}?entregable=${e.id}`}
                className="planb__misemana-fila"
              >
                <span className="planb__misemana-fila-titulo">{e.nombre}</span>
                <span className="planb__misemana-fila-fecha">
                  {fechaLocal(e.fecha_entrega).toLocaleDateString("es-MX", {
                    weekday: "short",
                    day: "numeric",
                  })}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="planb__misemana-col planb__misemana-col--agenda">
        <h3>Mi agenda</h3>
        {agenda.length === 0 ? (
          <p className="planb__misemana-vacio">Sin reuniones esta semana.</p>
        ) : (
          <div className="stack" style={{ gap: 6 }}>
            {agenda.map((r) =>
              r.proyecto_id ? (
                <Link
                  key={r.id}
                  to={`/app/proyectos/${r.proyecto_id}?reunion=${r.id}`}
                  className="planb__misemana-fila"
                >
                  <span className="planb__misemana-fila-titulo">{r.titulo}</span>
                  <span className="planb__misemana-fila-fecha">
                    {new Date(r.fecha_inicio).toLocaleDateString("es-MX", {
                      weekday: "short",
                      day: "numeric",
                    })}
                  </span>
                </Link>
              ) : (
                <div key={r.id} className="planb__misemana-fila">
                  <span className="planb__misemana-fila-titulo">{r.titulo}</span>
                  <span className="planb__misemana-fila-fecha">
                    {new Date(r.fecha_inicio).toLocaleDateString("es-MX", {
                      weekday: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}

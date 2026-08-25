import { useEffect, useState } from "react";
import { entregablesApi, proyectosApi, reunionesApi } from "../../api/endpoints";
import { useAuth } from "../../context/AuthContext";
import { fechaLocal } from "../../utils/fechas";
import BadgeUrgente from "../BadgeUrgente";

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
// Agrupa una lista de entregables por día de entrega y, dentro de cada día,
// pone primero los urgentes (2026-08-24, a petición de Yue: "por dia y por
// prioridad" en Mis tareas) -- "prioridad" aquí es el campo real `urgente`
// que ya calcula el backend (es_urgente), no un nivel inventado (ver nota
// en app.css sobre por qué Plan B no inventa niveles de prioridad).
function agruparPorDiaYUrgencia(lista) {
  const ordenada = [...lista].sort((a, b) => {
    const porFecha = a.fecha_entrega.localeCompare(b.fecha_entrega);
    if (porFecha !== 0) return porFecha;
    if (a.urgente !== b.urgente) return a.urgente ? -1 : 1;
    return a.nombre.localeCompare(b.nombre);
  });
  const grupos = [];
  for (const e of ordenada) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.fecha_entrega === e.fecha_entrega) {
      ultimo.items.push(e);
    } else {
      grupos.push({ fecha_entrega: e.fecha_entrega, items: [e] });
    }
  }
  return grupos;
}

// Igual que agruparPorDiaYUrgencia pero para reuniones (2026-08-24, a
// petición de Yue: "lo mismo en mi agenda, como ahí no hay algo como
// urgente, entonces solo por día") -- ordena por fecha_inicio y agrupa por
// día calendario; dentro del día se conserva el orden por hora (sin
// concepto de urgencia en reuniones).
function agruparReunionesPorDia(lista) {
  const ordenada = [...lista].sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio));
  const grupos = [];
  for (const r of ordenada) {
    const f = new Date(r.fecha_inicio);
    const clave = `${f.getFullYear()}-${f.getMonth()}-${f.getDate()}`;
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.clave === clave) {
      ultimo.items.push(r);
    } else {
      grupos.push({ clave, fecha: f, items: [r] });
    }
  }
  return grupos;
}

export default function MiSemana({ semana, onAbrirEntregable, onAbrirReunion }) {
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

  const entregablesDeLaSemana = entregables.filter((e) => {
    const f = fechaLocal(e.fecha_entrega);
    return f >= semana.inicio && f <= finInclusive;
  });

  const tareas = entregablesDeLaSemana.filter((e) => e.responsable_id === usuario?.id);
  const gruposTareas = agruparPorDiaYUrgencia(tareas);

  // Tareas que YO asigné a alguien más (2026-08-24, a petición de Yue: que
  // Bernardo vea abajo de "Mis tareas" lo que le asignó a David, por
  // ejemplo) -- `creado_por` es quien la creó originalmente y no cambia al
  // reasignar (ver Entregable.creado_por), así que sigue siendo "lo que
  // asigné" aunque después se le haya cambiado el responsable a alguien
  // más. Se excluye lo que me asigné a mí mismo -- eso ya está arriba.
  const asignadas = entregablesDeLaSemana.filter(
    (e) => e.creado_por === usuario?.id && e.responsable_id !== usuario?.id
  );
  const gruposAsignadas = agruparPorDiaYUrgencia(asignadas);

  // Mismo criterio que el backend en /dashboard/resumen (reuniones_proximas):
  // una reunión que ya empezó deja de "faltar" -- se oculta sola en cuanto
  // pasa su hora, sin esperar a que cambie el día (2026-08-25, a petición
  // de Yue: "si ya son las 11am, ya se tomaron las anteriores").
  const ahora = new Date();
  const agenda = reuniones
    .filter(
      (r) =>
        r.organizador_id === usuario?.id ||
        r.participantes?.some((p) => p.usuario_id === usuario?.id)
    )
    .filter((r) => {
      const f = new Date(r.fecha_inicio);
      return f >= semana.inicio && f <= finInclusive && f >= ahora;
    })
    .sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio));
  const gruposAgenda = agruparReunionesPorDia(agenda);

  return (
    <div className="planb__misemana">
      <div className="planb__misemana-col planb__misemana-col--tareas">
        <h3>Mis tareas</h3>
        {tareas.length === 0 ? (
          <p className="planb__misemana-vacio">Sin tareas con fecha esta semana.</p>
        ) : (
          gruposTareas.map((grupo) => (
            <div key={grupo.fecha_entrega} className="planb__misemana-grupo-dia">
              <p className="planb__misemana-dia">
                {fechaLocal(grupo.fecha_entrega).toLocaleDateString("es-MX", {
                  weekday: "long",
                  day: "numeric",
                })}
              </p>
              <div className="stack" style={{ gap: 6 }}>
                {grupo.items.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    className="planb__misemana-fila"
                    onClick={() => onAbrirEntregable?.(e.proyecto_id, e.id)}
                  >
                    {e.urgente && <BadgeUrgente urgente={e.urgente} />}
                    <span className="planb__misemana-fila-titulo">{e.nombre}</span>
                  </button>
                ))}
              </div>
            </div>
          ))
        )}

        {/* Tareas que asigné a alguien más, separadas abajo con acento
            amarillo (2026-08-24, a petición de Yue) -- ver filtro
            `asignadas` arriba. */}
        <h3 className="planb__misemana-subtitulo">Mis tareas asignadas</h3>
        {asignadas.length === 0 ? (
          <p className="planb__misemana-vacio">Sin tareas asignadas por ti esta semana.</p>
        ) : (
          gruposAsignadas.map((grupo) => (
            <div key={grupo.fecha_entrega} className="planb__misemana-grupo-dia">
              <p className="planb__misemana-dia">
                {fechaLocal(grupo.fecha_entrega).toLocaleDateString("es-MX", {
                  weekday: "long",
                  day: "numeric",
                })}
              </p>
              <div className="stack" style={{ gap: 6 }}>
                {grupo.items.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    className="planb__misemana-fila planb__misemana-fila--asignada"
                    onClick={() => onAbrirEntregable?.(e.proyecto_id, e.id)}
                  >
                    {e.urgente && <BadgeUrgente urgente={e.urgente} />}
                    <span className="planb__misemana-fila-titulo">
                      {e.nombre}{" "}
                      <span className="planb__misemana-fila-responsable">
                        — {e.responsable_nombre}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="planb__misemana-col planb__misemana-col--agenda">
        <h3>Mi agenda</h3>
        {agenda.length === 0 ? (
          <p className="planb__misemana-vacio">Sin reuniones esta semana.</p>
        ) : (
          gruposAgenda.map((grupo) => (
            <div key={grupo.clave} className="planb__misemana-grupo-dia">
              <p className="planb__misemana-dia">
                {grupo.fecha.toLocaleDateString("es-MX", {
                  weekday: "long",
                  day: "numeric",
                })}
              </p>
              <div className="stack" style={{ gap: 6 }}>
                {grupo.items.map((r) =>
                  r.proyecto_id ? (
                    <button
                      key={r.id}
                      type="button"
                      className="planb__misemana-fila"
                      onClick={() => onAbrirReunion?.(r.proyecto_id, r.id)}
                    >
                      <span className="planb__misemana-fila-titulo">{r.titulo}</span>
                      <span className="planb__misemana-fila-fecha">
                        {new Date(r.fecha_inicio).toLocaleTimeString("es-MX", {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                    </button>
                  ) : (
                    <div key={r.id} className="planb__misemana-fila">
                      <span className="planb__misemana-fila-titulo">{r.titulo}</span>
                      <span className="planb__misemana-fila-fecha">
                        {new Date(r.fecha_inicio).toLocaleTimeString("es-MX", {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  )
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

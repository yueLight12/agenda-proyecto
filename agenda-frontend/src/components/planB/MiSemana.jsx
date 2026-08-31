import { Fragment, useEffect, useState } from "react";
import { entregablesApi, pendientesPersonalesApi, proyectosApi, reunionesApi } from "../../api/endpoints";
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

// Colapsar cada sección por separado (2026-08-28, a petición de Yue) --
// persistido en localStorage por dispositivo, mismo patrón que
// RendimientoEquipo.jsx (METRICAS_DEFAULT/cargarMetricasVisibles). Todas
// expandidas por default -- entrar la primera vez se ve igual que antes.
const CLAVE_SECCIONES_COLAPSADAS = "misemana_secciones_colapsadas";
const SECCIONES_DEFAULT = { tareas: false, asignadas: false, agenda: false, pendientes: false };

function cargarSeccionesColapsadas() {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE_SECCIONES_COLAPSADAS));
    if (guardado && typeof guardado === "object") return { ...SECCIONES_DEFAULT, ...guardado };
  } catch {
    // localStorage corrupto o inaccesible -- se queda con el default.
  }
  return { ...SECCIONES_DEFAULT };
}

function EncabezadoSeccion({ clave, colapsadas, alternar, className, children }) {
  const colapsada = colapsadas[clave];
  return (
    <button
      type="button"
      className={`planb__misemana-encabezado-seccion${className ? ` ${className}` : ""}`}
      onClick={() => alternar(clave)}
      aria-expanded={!colapsada}
    >
      <span className={`planb__misemana-chevron${colapsada ? " planb__misemana-chevron--colapsado" : ""}`}>
        ▾
      </span>
      {children}
    </button>
  );
}

export default function MiSemana({ semana, onAbrirEntregable, onAbrirReunion }) {
  const { usuario } = useAuth();
  const [seccionesColapsadas, setSeccionesColapsadas] = useState(cargarSeccionesColapsadas);

  const alternarSeccion = (clave) => {
    setSeccionesColapsadas((prev) => {
      const siguiente = { ...prev, [clave]: !prev[clave] };
      try {
        localStorage.setItem(CLAVE_SECCIONES_COLAPSADAS, JSON.stringify(siguiente));
      } catch {
        // Privacidad estricta / cuota llena -- la preferencia solo dura la sesión.
      }
      return siguiente;
    });
  };

  const [entregables, setEntregables] = useState([]);
  const [reuniones, setReuniones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  // Divisor "Ahora" dentro del día de hoy en "Mi agenda" (2026-08-28, a
  // petición de Yue: mismo espíritu que la línea roja de Teams en el
  // Calendario, pero adaptado a una lista por día en vez de una
  // cuadrícula de horas -- aquí no hay eje de horas contra qué
  // posicionar una línea, así que se separan las reuniones ya pasadas de
  // las que faltan hoy). Se actualiza solo cada minuto mientras la
  // pantalla siga abierta, igual que la línea del Calendario.
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  // Pendientes personales (2026-08-27, a petición de Yue: "pasar por
  // leche", "pagar colegiatura" -- cosas privadas que no son ni reuniones
  // ni tareas de proyecto). A diferencia de reuniones/entregables, NO se
  // filtran por `semana` -- es un checklist que persiste hasta marcarse
  // como hecho, no algo agendado a un rango de fechas puntual.
  const [pendientesPersonales, setPendientesPersonales] = useState([]);
  const [nuevoPendiente, setNuevoPendiente] = useState("");
  const [nuevaFechaPendiente, setNuevaFechaPendiente] = useState("");

  const cargarPendientesPersonales = () => {
    pendientesPersonalesApi.listar().then(setPendientesPersonales).catch(() => {});
  };

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

  useEffect(cargarPendientesPersonales, []);

  const agregarPendientePersonal = (evento) => {
    evento.preventDefault();
    const contenido = nuevoPendiente.trim();
    if (!contenido) return;
    pendientesPersonalesApi
      .crear({ contenido, fecha_limite: nuevaFechaPendiente || null })
      .then(() => {
        setNuevoPendiente("");
        setNuevaFechaPendiente("");
        cargarPendientesPersonales();
      })
      .catch(() => {});
  };

  const alternarHechoPendientePersonal = (pendiente) => {
    pendientesPersonalesApi
      .actualizar(pendiente.id, { hecho: !pendiente.hecho })
      .then(cargarPendientesPersonales)
      .catch(() => {});
  };

  const eliminarPendientePersonal = (pendienteId) => {
    pendientesPersonalesApi.eliminar(pendienteId).then(cargarPendientesPersonales).catch(() => {});
  };

  if (cargando) return <p>Cargando tu semana...</p>;
  if (error) return <p className="error-text">{error}</p>;

  // `fin` es medianoche del domingo -- se compara hasta el final de ese día
  // (23:59:59.999) para no perder reuniones con hora avanzada el domingo.
  const finInclusive = new Date(semana.fin);
  finInclusive.setHours(23, 59, 59, 999);

  // Cota inferior de reuniones (2026-08-30, a petición de Yue: "que
  // desaparezcan al final del día") -- una reunión de un día YA pasado
  // dentro de la semana en curso ya no debe verse en "Mi agenda" (antes
  // solo se ocultaban al cambiar de semana, así que el lunes seguía
  // apareciendo el jueves). Si la semana visible es una semana pasada
  // completa (navegando el historial), se sigue mostrando entera --
  // aquí no aplica "desaparecer", es una consulta de historial. Si es la
  // semana actual o una futura, la cota inferior es HOY a medianoche.
  const inicioHoy = new Date();
  inicioHoy.setHours(0, 0, 0, 0);
  const cotaInferiorReuniones = finInclusive < inicioHoy ? semana.inicio : (semana.inicio > inicioHoy ? semana.inicio : inicioHoy);

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

  // Una reunión de HOY se queda visible todo el día, aunque ya haya
  // empezado o pasado su hora (2026-08-27, a petición de Yue: "puede pasar
  // que no dé tiempo de tomarla, o que empiece tarde, y si desaparece
  // inmediatamente ya no está disponible para tomarla o dejar notas") --
  // pero un día YA pasado dentro de la semana en curso sí desaparece
  // (2026-08-30, a petición de Yue: "que desaparezcan al final del día"),
  // vía cotaInferiorReuniones. Si la semana visible ya terminó por
  // completo, se muestra íntegra (consulta de historial, no aplica
  // "desaparecer").
  const agenda = reuniones
    .filter(
      (r) =>
        r.organizador_id === usuario?.id ||
        r.participantes?.some((p) => p.usuario_id === usuario?.id)
    )
    .filter((r) => {
      const f = new Date(r.fecha_inicio);
      return f >= cotaInferiorReuniones && f <= finInclusive;
    })
    .sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio));
  const gruposAgenda = agruparReunionesPorDia(agenda);

  return (
    <div className="planb__misemana">
      <div className="planb__misemana-col planb__misemana-col--tareas">
        <EncabezadoSeccion clave="tareas" colapsadas={seccionesColapsadas} alternar={alternarSeccion}>
          Mis tareas a realizar
        </EncabezadoSeccion>
        {!seccionesColapsadas.tareas && (tareas.length === 0 ? (
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
        ))}

        {/* Tareas que asigné a alguien más, separadas abajo con acento
            amarillo (2026-08-24, a petición de Yue) -- ver filtro
            `asignadas` arriba. */}
        <EncabezadoSeccion
          clave="asignadas"
          colapsadas={seccionesColapsadas}
          alternar={alternarSeccion}
          className="planb__misemana-subtitulo"
        >
          Mis tareas que asigné
        </EncabezadoSeccion>
        {!seccionesColapsadas.asignadas && (asignadas.length === 0 ? (
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
        ))}
      </div>

      <div className="planb__misemana-col planb__misemana-col--agenda">
        <EncabezadoSeccion clave="agenda" colapsadas={seccionesColapsadas} alternar={alternarSeccion}>
          Mi agenda
        </EncabezadoSeccion>
        {!seccionesColapsadas.agenda && (agenda.length === 0 ? (
          <p className="planb__misemana-vacio">Sin reuniones esta semana.</p>
        ) : (
          gruposAgenda.map((grupo) => {
            // Divisor "Ahora" solo en el grupo de HOY (misma clave
            // año-mes-día que `ahora`, ver agruparReunionesPorDia arriba)
            // -- posición = primer ítem con fecha_inicio futura; si todos
            // ya pasaron, el divisor queda al final del día.
            const claveHoy = `${ahora.getFullYear()}-${ahora.getMonth()}-${ahora.getDate()}`;
            const esGrupoHoy = grupo.clave === claveHoy;
            const indiceDivisor = esGrupoHoy
              ? (() => {
                  const i = grupo.items.findIndex((r) => new Date(r.fecha_inicio) > ahora);
                  return i === -1 ? grupo.items.length : i;
                })()
              : -1;
            // Etiqueta del divisor (2026-08-31, a petición de Yue: "que no
            // diga Ahora, que diga qué día y hora") -- día + hora en vez de
            // la palabra fija, mismo formato que ya usan el encabezado de
            // día y la hora de cada reunión más abajo.
            const etiquetaAhora = `${ahora.toLocaleDateString("es-MX", {
              weekday: "long",
              day: "numeric",
            })}, ${ahora.toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" })}`;

            return (
              <div key={grupo.clave} className="planb__misemana-grupo-dia">
                <p className="planb__misemana-dia">
                  {grupo.fecha.toLocaleDateString("es-MX", {
                    weekday: "long",
                    day: "numeric",
                  })}
                </p>
                <div className="stack" style={{ gap: 6 }}>
                  {grupo.items.map((r, idx) => (
                    <Fragment key={r.id}>
                      {idx === indiceDivisor && (
                        <div key="ahora" className="planb__misemana-ahora" role="separator" aria-label={etiquetaAhora}>
                          <span className="planb__misemana-ahora-linea" />
                          <span className="planb__misemana-ahora-etiqueta">{etiquetaAhora}</span>
                          <span className="planb__misemana-ahora-linea" />
                        </div>
                      )}
                      {r.proyecto_id ? (
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
                      )}
                    </Fragment>
                  ))}
                  {indiceDivisor === grupo.items.length && (
                    <div className="planb__misemana-ahora" role="separator" aria-label={etiquetaAhora}>
                      <span className="planb__misemana-ahora-linea" />
                      <span className="planb__misemana-ahora-etiqueta">{etiquetaAhora}</span>
                      <span className="planb__misemana-ahora-linea" />
                    </div>
                  )}
                </div>
              </div>
            );
          })
        ))}

        {/* Pendientes personales -- separados de las reuniones a propósito
            (2026-08-27, a petición de Yue: "separar mis reuniones con
            temas personales"). 100% privados, ver
            app/models/pendiente_personal.py -- nadie más los ve. */}
        <EncabezadoSeccion
          clave="pendientes"
          colapsadas={seccionesColapsadas}
          alternar={alternarSeccion}
          className="planb__misemana-subtitulo"
        >
          Mis pendientes
        </EncabezadoSeccion>
        {!seccionesColapsadas.pendientes && (
        <>
        <form className="planb__misemana-nuevo-pendiente" onSubmit={agregarPendientePersonal}>
          <input
            className="input"
            type="text"
            placeholder="Agregar un pendiente personal..."
            value={nuevoPendiente}
            onChange={(e) => setNuevoPendiente(e.target.value)}
          />
          <input
            className="input"
            type="date"
            aria-label="Fecha límite (opcional)"
            value={nuevaFechaPendiente}
            onChange={(e) => setNuevaFechaPendiente(e.target.value)}
          />
          <button type="submit" className="btn btn--ghost">
            +
          </button>
        </form>
        {pendientesPersonales.length === 0 ? (
          <p className="planb__misemana-vacio">Sin pendientes personales.</p>
        ) : (
          <div className="stack" style={{ gap: 6 }}>
            {pendientesPersonales.map((p) => (
              <div key={p.id} className="planb__misemana-fila planb__misemana-pendiente-personal">
                <label className="planb__misemana-pendiente-personal-check">
                  <input
                    type="checkbox"
                    checked={p.hecho}
                    onChange={() => alternarHechoPendientePersonal(p)}
                  />
                  <span
                    className="planb__misemana-fila-titulo"
                    style={p.hecho ? { textDecoration: "line-through", opacity: 0.6 } : undefined}
                  >
                    {p.contenido}
                  </span>
                </label>
                {p.fecha_limite && (
                  <span className="planb__misemana-fila-fecha">
                    {fechaLocal(p.fecha_limite).toLocaleDateString("es-MX", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                )}
                <button
                  type="button"
                  className="planb__misemana-pendiente-personal-borrar"
                  aria-label="Eliminar pendiente"
                  onClick={() => eliminarPendientePersonal(p.id)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        </>
        )}
      </div>
    </div>
  );
}

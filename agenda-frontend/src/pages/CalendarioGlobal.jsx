import { useEffect, useState } from "react";
import CalendarioEntregables from "../components/CalendarioEntregables";
import FormularioEntregable from "../components/FormularioEntregable";
import Modal from "../components/Modal";
import ModalEventoEmpresa from "../components/ModalEventoEmpresa";
import ModalReunion from "../components/ModalReunion";

const ETIQUETA_TIPO_AUSENCIA = { vacaciones: "Vacaciones", permiso: "Permiso", incapacidad: "Incapacidad" };
import {
  entregablesApi,
  eventosEmpresaApi,
  miEquipoApi,
  proyectosApi,
  reunionesApi,
  solicitudesAusenciaApi,
  usuariosApi,
} from "../api/endpoints";
import { useAuth } from "../context/AuthContext";
import { useEventosTiempoReal } from "../hooks/useEventosTiempoReal";

export default function CalendarioGlobal({ altoCalendario } = {}) {
  const { usuario } = useAuth();
  const [entregables, setEntregables] = useState([]);
  const [reuniones, setReuniones] = useState([]);
  // "Asignar tarea" desde una reunión (2026-09-18) -- ModalReunion solo
  // muestra ese botón si recibe `equipoDisponible` (ver su docstring);
  // este calendario nunca lo cargaba, mismo mecanismo que ya usa
  // AgendaPlanB.jsx (miEquipoApi.listar -- "a quién le puedo asignar").
  const [equipo, setEquipo] = useState([]);
  // Cachés por proyecto_id, llenadas BAJO DEMANDA al abrir un entregable o
  // reunión (2026-09-18, a petición de Yue: "que todo sea instantáneo")
  // -- antes cargarTodo pedía equipo/invitables de CADA proyecto/subtema
  // visible por adelantado (una petición en paralelo por cada uno, aunque
  // nunca se llegara a abrir su modal), lo que volvía la carga inicial
  // más lenta entre más gente iba creando temas. Mismo patrón ya usado en
  // AgendaPlanB.jsx (abrirEntregable/abrirReunion) -- pedir solo lo que
  // hace falta, justo cuando hace falta.
  const [equiposPorProyecto, setEquiposPorProyecto] = useState({});
  const [invitablesPorProyecto, setInvitablesPorProyecto] = useState({});
  const [invitablesGenerales, setInvitablesGenerales] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [cargandoModal, setCargandoModal] = useState(false);
  const [error, setError] = useState("");
  const [modalEntregable, setModalEntregable] = useState(null);
  const [modalReunion, setModalReunion] = useState(null);
  const [modalEventoEmpresa, setModalEventoEmpresa] = useState(null);
  // Ausencias aprobadas (2026-09-23, a petición de Yue) -- ya vienen
  // filtradas por el backend a exactamente lo que este usuario debe ver
  // (solicitante, aprobador, o copiado -- ver listar_visibles en
  // app/services/solicitudes_ausencia.py); aquí solo se filtra "aprobada"
  // (las pendientes/rechazadas no van al calendario).
  const [ausencias, setAusencias] = useState([]);
  const [modalAusencia, setModalAusencia] = useState(null);
  const [modo, setModo] = useState("general"); // "personal" | "general" | "empresa"
  const [eventosEmpresa, setEventosEmpresa] = useState([]);
  // Franja de hora elegida al arrastrar en la vista semana/día (2026-08-22,
  // calendario tipo Teams) -- se pasa como sugerencia al abrir "Nueva
  // reunión general", ver onSeleccionarFranja en CalendarioEntregables.
  const [franjaSugerida, setFranjaSugerida] = useState(null);

  const cargarTodo = async ({ silencioso = false } = {}) => {
    if (!silencioso) setCargando(true);
    setError("");
    try {
      const raices = await proyectosApi.listar();
      // Cada raíz trae, en cascada, los entregables/reuniones de todo su
      // subárbol de subtemas (query generalizada en el backend, ver Fase 1
      // de jerarquía 2026-08-16) -- pero cada ítem trae su proyecto_id REAL
      // (el del subtema exacto, no el de la raíz), así que el nombre se
      // resuelve por ese id propio, no por el de la raíz que disparó el fetch.
      const [listasEntregables, listasReuniones, reunionesGenerales, arbol, eventos] =
        await Promise.all([
          Promise.all(raices.map((p) => entregablesApi.listarPorProyecto(p.id))),
          Promise.all(raices.map((p) => reunionesApi.listarPorProyecto(p.id))),
          reunionesApi.listarGenerales(),
          // Nombres de TODO el árbol visible (raíces + subtemas) en UNA sola
          // petición -- antes era una petición por cada subtema distinto
          // que apareciera en un entregable/reunión (2026-09-18, a petición
          // de Yue: "que todo sea instantáneo" -- esto era buena parte de
          // por qué el calendario tardaba en mostrarse con varios usuarios
          // creando temas). Ver GET /proyectos/arbol-visible.
          proyectosApi.arbolVisible(),
          eventosEmpresaApi.listar(),
        ]);
      // Ausencias aprobadas (aparte del Promise.all de arriba: endpoint
      // nuevo, sin fallback necesario -- si algún día se retira la regla
      // completa esto simplemente devuelve lista vacía, no rompe nada).
      solicitudesAusenciaApi
        .listar()
        .then((solicitudes) => setAusencias(solicitudes.filter((s) => s.estatus === "aprobada")))
        .catch(() => {});
      const todosEntregables = listasEntregables.flat();
      const todosReuniones = [...listasReuniones.flat(), ...reunionesGenerales];

      const nombresPorId = Object.fromEntries(arbol.map((p) => [p.id, p.nombre]));

      setEntregables(
        todosEntregables.map((e) => ({ ...e, proyecto_nombre: nombresPorId[e.proyecto_id] }))
      );
      setReuniones(
        todosReuniones.map((r) => ({
          ...r,
          proyecto_nombre: r.proyecto_id ? nombresPorId[r.proyecto_id] : "General",
        }))
      );
      setEventosEmpresa(eventos);
    } catch {
      setError("No se pudo cargar el calendario. Intenta de nuevo más tarde.");
    } finally {
      if (!silencioso) setCargando(false);
    }
  };

  useEffect(() => {
    cargarTodo();
    // 2026-09-22, regla nueva SOLO USO LOCAL ("todos pueden asignar
    // tareas/invitar a todos") -- mismo patrón que AgendaPlanB.jsx:
    // intenta el directorio completo, cae de vuelta a "tu equipo" si la
    // regla está apagada (404).
    usuariosApi
      .directorio()
      .catch(() => miEquipoApi.listar())
      .then(setEquipo)
      .catch(() => {});
    reunionesApi.invitables().then(setInvitablesGenerales).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tiempo real (2026-09-18, a petición de Yue: "que todo sea instantáneo,
  // especialmente ahora que varios usuarios lo están usando") -- cualquier
  // notificación nueva para este usuario (alguien creó/editó/completó algo
  // que le compete) recarga el calendario en silencio, sin el parpadeo de
  // "Cargando calendario..." de una carga manual. Mismo mecanismo que ya
  // usaba solo PendientesUrgentes.jsx -- ver useEventosTiempoReal.js.
  useEventosTiempoReal(() => cargarTodo({ silencioso: true }));

  // Trae (y cachea) el equipo de un proyecto solo la primera vez que hace
  // falta -- ver comentario junto a equiposPorProyecto arriba.
  const obtenerEquipoDe = async (proyectoId) => {
    if (equiposPorProyecto[proyectoId]) return equiposPorProyecto[proyectoId];
    const eq = await proyectosApi.equipo(proyectoId);
    setEquiposPorProyecto((prev) => ({ ...prev, [proyectoId]: eq }));
    return eq;
  };

  // Igual que obtenerEquipoDe pero para "a quién se puede invitar a una
  // reunión" (más permisivo que el equipo del tema, incluye jefe/Dirección
  // -- ver services/reuniones.py::listar_invitables_reunion).
  const obtenerInvitablesDe = async (proyectoId) => {
    if (!proyectoId) return invitablesGenerales;
    if (invitablesPorProyecto[proyectoId]) return invitablesPorProyecto[proyectoId];
    const inv = await reunionesApi.invitables(proyectoId);
    setInvitablesPorProyecto((prev) => ({ ...prev, [proyectoId]: inv }));
    return inv;
  };

  const abrirModalEntregable = async (item) => {
    setCargandoModal(true);
    try {
      await obtenerEquipoDe(item.proyecto_id);
      setModalEntregable(item);
    } catch {
      setError("No se pudo abrir el entregable.");
    } finally {
      setCargandoModal(false);
    }
  };

  const abrirModalReunion = async (item) => {
    setCargandoModal(true);
    try {
      await obtenerInvitablesDe(item?.proyecto_id ?? null);
      setModalReunion(item);
    } catch {
      setError("No se pudo abrir la reunión.");
    } finally {
      setCargandoModal(false);
    }
  };

  // Calculado en servidor (entregable.puede_editar / reunion.puede_editar) --
  // nunca cruzar usuario.roles_por_proyecto aquí, se rompe con herencia de
  // subtemas (ver Fase 1 de jerarquía, 2026-08-16).
  const puedeEditar = (item) => Boolean(item.puede_editar);

  const reprogramarEntregable = async (entregable, nuevaFecha) => {
    await entregablesApi.actualizar(entregable.id, { fecha_entrega: nuevaFecha });
    await cargarTodo();
  };

  const entregablesMostrados =
    modo === "empresa"
      ? []
      : modo === "personal"
      ? entregables.filter((e) => e.responsable_id === usuario?.id)
      : entregables;
  const reunionesMostradas =
    modo === "empresa"
      ? []
      : modo === "personal"
      ? reuniones.filter(
          (r) =>
            r.organizador_id === usuario?.id ||
            r.participantes?.some((p) => p.usuario_id === usuario?.id)
        )
      : reuniones;
  const eventosEmpresaMostrados = modo === "empresa" ? eventosEmpresa : [];

  if (cargando) return <p>Cargando calendario...</p>;
  if (error) return <p className="error-text">{error}</p>;

  return (
    <div className="stack">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h1>Calendario</h1>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            className={modo === "personal" ? "btn btn--primary" : "btn btn--ghost"}
            onClick={() => setModo("personal")}
          >
            Personal
          </button>
          <button
            className={modo === "general" ? "btn btn--primary" : "btn btn--ghost"}
            onClick={() => setModo("general")}
          >
            General
          </button>
          <button
            className={modo === "empresa" ? "btn btn--primary" : "btn btn--ghost"}
            onClick={() => setModo("empresa")}
          >
            Empresa
          </button>
        </div>
      </div>
      {modo !== "empresa" && entregablesMostrados.length === 0 && reunionesMostradas.length === 0 && (
        <p style={{ color: "var(--color-text-muted)" }}>
          {modo === "personal"
            ? "No tienes entregables ni reuniones propias todavía."
            : "No hay entregables ni reuniones visibles para ti todavía."}
        </p>
      )}
      {modo === "empresa" && eventosEmpresaMostrados.length === 0 && (
        <p style={{ color: "var(--color-text-muted)" }}>
          Todavía no hay cumpleaños ni eventos de empresa cargados.
        </p>
      )}
      <div className="card">
        <CalendarioEntregables
          entregables={entregablesMostrados}
          reuniones={reunionesMostradas}
          eventosEmpresa={eventosEmpresaMostrados}
          ausencias={modo === "empresa" ? [] : ausencias}
          editable
          puedeEditar={puedeEditar}
          onReprogramar={reprogramarEntregable}
          onEntregableClick={abrirModalEntregable}
          onReunionClick={abrirModalReunion}
          onEventoEmpresaClick={(ev) => setModalEventoEmpresa(ev)}
          onAusenciaClick={(a) => setModalAusencia(a)}
          onSeleccionarFranja={(franja) => {
            setFranjaSugerida(franja);
            setModalReunion("nueva-general");
          }}
          {...(altoCalendario ? { alto: altoCalendario } : {})}
        />
      </div>

      {cargandoModal && (
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>Abriendo...</p>
      )}

      {modalEntregable && (
        <FormularioEntregable
          proyectoId={modalEntregable.proyecto_id}
          entregable={modalEntregable}
          miembros={equiposPorProyecto[modalEntregable.proyecto_id] || []}
          puedeAsignarAOtros={puedeEditar(modalEntregable)}
          puedeAdministrarProyecto={Boolean(modalEntregable.puede_administrar)}
          usuarioActualId={usuario?.id}
          onGuardado={async () => {
            setModalEntregable(null);
            await cargarTodo();
          }}
          onCerrar={() => setModalEntregable(null)}
        />
      )}

      {modalEventoEmpresa && (
        <ModalEventoEmpresa evento={modalEventoEmpresa} onCerrar={() => setModalEventoEmpresa(null)} />
      )}

      {modalAusencia && (
        <Modal titulo="Ausencia aprobada" onCerrar={() => setModalAusencia(null)}>
          <div className="stack">
            <p style={{ margin: 0 }}>
              <strong>{modalAusencia.solicitante_nombre}</strong> —{" "}
              {ETIQUETA_TIPO_AUSENCIA[modalAusencia.tipo] || modalAusencia.tipo}
            </p>
            <p style={{ margin: 0, color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
              Del {modalAusencia.fecha_inicio} al {modalAusencia.fecha_fin}
            </p>
            <p style={{ margin: 0, color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
              Aprobó: {modalAusencia.aprobador_nombre || "—"}
            </p>
          </div>
        </Modal>
      )}

      {/* onGuardado va SIEMPRE con silencioso:true (2026-09-21, bug real:
          "se cierra el calendario y se vuelve a abrir la tarjeta de crear
          reunión") -- sin eso, cargarTodo() hacía setCargando(true), y el
          `if (cargando) return <p>Cargando...</p>` de arriba reemplaza TODO
          el árbol de este componente (calendario + este mismo modal), que
          reaparece solo al terminar de cargar porque el estado modalReunion
          nunca se tocó -- se veía como que todo se cerraba y se reabría
          solo. Guardar una reunión NO debe cerrar su propio modal (ver
          mismo criterio en AgendaPlanB.jsx), así que tampoco hay que tocar
          onCerrar aquí. */}
      {modalReunion && modalReunion !== "nueva-general" && (
        <ModalReunion
          proyectoId={modalReunion.proyecto_id}
          reunion={modalReunion}
          miembros={
            modalReunion.proyecto_id
              ? invitablesPorProyecto[modalReunion.proyecto_id] || []
              : invitablesGenerales
          }
          organizadorId={modalReunion.organizador_id}
          puedeAdministrar={puedeEditar(modalReunion)}
          equipoDisponible={equipo}
          onGuardado={() => cargarTodo({ silencioso: true })}
          onCerrar={() => setModalReunion(null)}
        />
      )}

      {modalReunion === "nueva-general" && (
        <ModalReunion
          proyectoId={null}
          reunion={null}
          miembros={invitablesGenerales}
          organizadorId={usuario?.id}
          puedeAdministrar
          equipoDisponible={equipo}
          fechaHoraSugerida={franjaSugerida}
          onGuardado={() => cargarTodo({ silencioso: true })}
          onCerrar={() => {
            setModalReunion(null);
            setFranjaSugerida(null);
          }}
        />
      )}
    </div>
  );
}

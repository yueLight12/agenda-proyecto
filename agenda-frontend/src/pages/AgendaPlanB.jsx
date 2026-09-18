import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { entregablesApi, miEquipoApi, proyectosApi, reunionesApi } from "../api/endpoints";
import { useAuth } from "../context/AuthContext";
import Modal from "../components/Modal";
import AppearanceSettings from "../components/AppearanceSettings";
import ModalAsignarTareaRapida from "../components/ModalAsignarTareaRapida";
import ModalEditarProyecto from "../components/ModalEditarProyecto";
import FormularioEntregable from "../components/FormularioEntregable";
import ModalReunion from "../components/ModalReunion";
import CalendarioGlobal from "./CalendarioGlobal";
import FabAsistenteVoz from "../components/FabAsistenteVoz";
import BotonNotificacionesPush from "../components/BotonNotificacionesPush";
import OnboardingTour from "../components/OnboardingTour";
import SelectorSemanaDestacado from "../components/planB/SelectorSemanaDestacado";
import TarjetasAsignar from "../components/planB/TarjetasAsignar";
import SelectorPersona from "../components/planB/SelectorPersona";
import PendientesUrgentes from "../components/planB/PendientesUrgentes";
import RendimientoEquipo from "../components/planB/RendimientoEquipo";
import { ESTILOS_PLANB, useEstiloPlanB } from "../hooks/useEstiloPlanB";
import { useTema } from "../hooks/useTema";
import { usePreferenciasApariencia } from "../hooks/usePreferenciasApariencia";
import { iniciales } from "../utils/avatarPersona";

// Pantalla única "Agenda Plan B" (2026-08-20, a petición de Yue, a partir de
// un boceto a mano) -- ES la ventana principal del sistema ahora ("/" monta
// esto directo, ver App.jsx): sin sidebar/topbar de AppLayout.jsx, pensada
// para resolver en pocos clics lo más común (asignar una tarea, crear un
// tema, ver pendientes urgentes) sin tener que navegar primero a un
// proyecto/tema específico. El sistema anterior (Seguimiento/Proyectos/Mis
// pendientes/Calendario/etc., bajo AppLayout) NO se borró -- sigue intacto
// como respaldo ("segundo plan", palabras de Yue) en /equipo, /proyectos/:id,
// etc., pero sin ningún link visible desde aquí -- Yue pidió explícitamente
// que no haya botón de regreso a la app anterior. Reusa los mismos
// formularios/modales que ya usaba el resto del sistema (ModalAsignarTareaRapida,
// ModalEditarProyecto, CalendarioGlobal), sin duplicar lógica.
export default function AgendaPlanB() {
  const { usuario, logout } = useAuth();
  const { estilo, siguienteEstilo } = useEstiloPlanB();
  const { tema, alternarTema } = useTema();
  const { cardOrder, hiddenCards } = usePreferenciasApariencia();
  const [fechaRef, setFechaRef] = useState(new Date());
  const [equipo, setEquipo] = useState([]);
  const [cargandoEquipo, setCargandoEquipo] = useState(true);
  const [errorEquipo, setErrorEquipo] = useState("");
  const [modalActivo, setModalActivo] = useState(null); // 'tarea' | 'proyecto' | 'persona' | 'agenda' | null
  const [personaElegida, setPersonaElegida] = useState(null);
  const [recargarPendientes, setRecargarPendientes] = useState(0);
  // Panel "Personalizar apariencia" (2026-08-26, a petición de Yue) -- ver
  // AppearanceSettings.jsx / usePreferenciasApariencia.js.
  const [mostrarApariencia, setMostrarApariencia] = useState(false);
  // "Modo editor" (2026-08-31, a petición de Yue: "dejar oculto lo de poder
  // modificar la interfaz, el estilo y el tema, que solo aparezca con un
  // botón") -- los 3 controles de personalización (🎨 apariencia, rotador
  // de estilo visual, claro/oscuro) quedan ocultos del topbar por default y
  // solo se muestran mientras este modo está activo. Empieza siempre
  // apagado (no se persiste): es un modo de "estoy ajustando cosas ahora",
  // no una preferencia permanente -- igual que "Personalizar apariencia" en
  // sí, que ya es un modal aparte y no un panel siempre abierto.
  const [modoEditor, setModoEditor] = useState(false);

  // Detalle de un entregable/reunión abierto desde un link de "Pendientes
  // urgentes"/"Mi semana" (2026-08-22, a petición de Yue: "la única
  // ventana estática es Agenda Plan B" -- antes esos links navegaban a
  // /proyectos/:id?entregable=X, que SÍ es una página real (TableroProyecto.jsx,
  // conservada como respaldo del sistema anterior) y dejaba ver su fondo
  // detrás del modal en vez del de Plan B). Carga solo lo que
  // FormularioEntregable/ModalReunion necesitan (entregable o reunión +
  // equipo/invitables + nombre del tema) -- deliberadamente más liviano que
  // TableroProyecto.cargarTodo, que pide 8 endpoints para poblar una
  // pantalla completa que aquí no hace falta.
  const [detalle, setDetalle] = useState(null); // { tipo: 'entregable'|'reunion', item, miembros, proyectoNombre }
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [errorDetalle, setErrorDetalle] = useState("");

  const abrirEntregable = useCallback(async (proyectoId, entregableId) => {
    setErrorDetalle("");
    setCargandoDetalle(true);
    try {
      const [lista, miembros, proyecto] = await Promise.all([
        entregablesApi.listarPorProyecto(proyectoId),
        proyectosApi.equipo(proyectoId),
        proyectosApi.obtener(proyectoId),
      ]);
      const item = lista.find((e) => e.id === entregableId);
      if (!item) {
        setErrorDetalle("Ya no se encontró ese entregable.");
        return;
      }
      setDetalle({ tipo: "entregable", item, miembros, proyectoNombre: proyecto.nombre });
    } catch {
      setErrorDetalle("No se pudo abrir el entregable.");
    } finally {
      setCargandoDetalle(false);
    }
  }, []);

  const abrirReunion = useCallback(async (proyectoId, reunionId) => {
    setErrorDetalle("");
    setCargandoDetalle(true);
    try {
      // Una reunión "general" (sin tema/proyecto, ver
      // app/routers/reuniones.py) no vive en listarPorProyecto -- viene de
      // listarGenerales() (2026-09-17, bug real: "nueva reuninon" de Juan
      // José no era clickeable en Mi agenda por esto).
      const [lista, invitables] = await Promise.all([
        proyectoId ? reunionesApi.listarPorProyecto(proyectoId) : reunionesApi.listarGenerales(),
        reunionesApi.invitables(proyectoId),
      ]);
      const item = lista.find((r) => r.id === reunionId);
      if (!item) {
        setErrorDetalle("Ya no se encontró esa reunión.");
        return;
      }
      setDetalle({ tipo: "reunion", item, miembros: invitables });
    } catch {
      setErrorDetalle("No se pudo abrir la reunión.");
    } finally {
      setCargandoDetalle(false);
    }
  }, []);

  const cerrarDetalle = () => {
    setDetalle(null);
    setErrorDetalle("");
  };

  // Guardar un entregable SÍ cierra el modal (mismo criterio que
  // TableroProyecto.jsx/CalendarioGlobal.jsx). Guardar una reunión NO lo
  // cierra -- ModalReunion mantiene su propio estado interno tras guardar
  // (deja ver el checklist recién creado/editado, ver su docstring), solo
  // hace falta refrescar el conteo de pendientes de fondo.
  const alGuardarEntregable = () => {
    cerrarDetalle();
    setRecargarPendientes((n) => n + 1);
  };
  const alGuardarReunion = () => {
    setRecargarPendientes((n) => n + 1);
  };

  // "A quién le puedo asignar" en Agenda Plan B (2026-08-21, a petición de
  // Yue tras probar el organigrama real): antes usaba equipoResumenApi
  // (cruza TODOS los proyectos donde el usuario es N1/N2, aplanando todos
  // los niveles -- para Bernardo eso mezclaba a David/Diana/Jasso con la
  // gente de SUS equipos, imposible de navegar). Ahora usa /mi-equipo
  // (miEquipoApi.listar -- plantilla personal + reportes reales con
  // supervisor_id == tú en cualquier tema, ver
  // listar_mi_equipo_efectivo en el backend), que es exactamente "las
  // personas directamente debajo de mí" -- el mismo mecanismo que ya
  // usa cada quien para armar su equipo, así que se generaliza solo por
  // nivel: David ve a Ana/Iván/Juan, no a quien reporte a ellos. No es un
  // cambio de permisos (query_entregables_visibles/listar_equipo_visible
  // no se tocaron) -- solo cambia qué lista alimenta este selector.
  const cargarEquipo = useCallback(() => {
    setCargandoEquipo(true);
    setErrorEquipo("");
    return miEquipoApi
      .listar()
      .then((data) => setEquipo(data))
      .catch(() => setErrorEquipo("No se pudo cargar tu equipo."))
      .finally(() => setCargandoEquipo(false));
  }, []);

  useEffect(() => {
    cargarEquipo();
  }, [cargarEquipo]);

  const cerrarModal = () => {
    setModalActivo(null);
    setPersonaElegida(null);
  };

  const alTerminarAsignacion = () => {
    cerrarModal();
    setRecargarPendientes((n) => n + 1);
  };

  return (
    <div className="planb">
      <OnboardingTour />
      <div className="planb__topbar">
        <div>
          <h1 style={{ margin: 0, fontSize: "1.4rem" }}>Mi Chamba</h1>
          {usuario && (
            <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
              {usuario.nombre}
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span id="tour-notificaciones">
            <BotonNotificacionesPush />
          </span>
          {/* "Modo editor" (2026-08-31) -- único control de personalización
              visible siempre; los otros 3 (apariencia/estilo/tema) solo
              aparecen mientras este está activo, ver estado arriba. */}
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setModoEditor((v) => !v)}
            aria-pressed={modoEditor}
            aria-label={modoEditor ? "Salir del modo editor" : "Entrar al modo editor"}
            title={modoEditor ? "Salir del modo editor" : "Personalizar interfaz, estilo y tema"}
          >
            ✏️
          </button>
          {modoEditor && (
            <>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setMostrarApariencia(true)}
                aria-label="Personalizar apariencia (vista previa)"
              >
                🎨
              </button>
              {/* Selector de estilo visual (reactivado 2026-08-25, a
                  petición de Yue -- ver useEstiloPlanB.js). Botón que rota
                  al siguiente estilo al dar clic (un <select> abría un menú
                  de pantalla completa en móvil, Yue pidió que cambiara
                  directo). */}
              <button
                type="button"
                className="btn btn--ghost"
                onClick={siguienteEstilo}
                aria-label="Cambiar estilo visual de Agenda Plan B"
              >
                {ESTILOS_PLANB.find((op) => op.valor === estilo)?.etiqueta || estilo}
              </button>
              {/* Tema claro/oscuro (2026-08-21, a petición de Yue) -- ya
                  existía en AppLayout.jsx pero Agenda Plan B es una
                  pantalla independiente (sin AppLayout), así que no lo
                  heredaba. Mismo hook/patrón exacto que AppLayout.jsx, ver
                  useTema.js. */}
              <button
                type="button"
                className="btn btn--ghost topbar-tema-btn"
                onClick={alternarTema}
                aria-label={tema === "oscuro" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
                aria-pressed={tema === "oscuro"}
              >
                {tema === "oscuro" ? "☀️" : "🌙"}
              </button>
            </>
          )}
          {usuario?.es_super_admin && (
            <Link to="/admin/usuarios" className="btn btn--ghost" title="Administración de usuarios">
              🛡️ Admin
            </Link>
          )}
          {!usuario?.es_super_admin && (
            <Link id="tour-mi-equipo" to="/mi-equipo" className="btn btn--ghost" title="Mi equipo">
              👥 Mi equipo
            </Link>
          )}
          <button type="button" className="btn btn--ghost" onClick={logout}>
            Salir
          </button>
          {usuario && (
            <Link id="tour-perfil" to="/perfil" className="planb__avatar" title="Mi perfil">
              {iniciales(usuario.nombre)}
            </Link>
          )}
        </div>
      </div>

      <div className="planb__contenido stack">
        <div id="tour-semana">
          <SelectorSemanaDestacado
            fechaRef={fechaRef}
            onCambiarFecha={setFechaRef}
            onAbrirEntregable={abrirEntregable}
            onAbrirReunion={abrirReunion}
          />
        </div>

        <div id="tour-asignar" className="card">
          <h2 style={{ fontSize: "1rem", marginBottom: 12 }}>Quiero asignar</h2>
          <TarjetasAsignar onAbrir={setModalActivo} cardOrder={cardOrder} hiddenCards={hiddenCards} />
        </div>

        <div id="tour-pendientes">
          <PendientesUrgentes
            recargarSenal={recargarPendientes}
            onAbrirEntregable={abrirEntregable}
            onAbrirReunion={abrirReunion}
          />
        </div>
      </div>

      {cargandoDetalle && (
        <Modal titulo="Cargando..." onCerrar={cerrarDetalle}>
          <p style={{ color: "var(--color-text-muted)" }}>Cargando detalle...</p>
        </Modal>
      )}

      {errorDetalle && !cargandoDetalle && (
        <Modal titulo="No se pudo abrir" onCerrar={cerrarDetalle}>
          <p className="error-text">{errorDetalle}</p>
        </Modal>
      )}

      {detalle?.tipo === "entregable" && !cargandoDetalle && (
        <FormularioEntregable
          proyectoId={detalle.item.proyecto_id}
          entregable={detalle.item}
          miembros={detalle.miembros}
          proyectoNombre={detalle.proyectoNombre}
          puedeAsignarAOtros={Boolean(detalle.item.puede_editar)}
          puedeAdministrarProyecto={Boolean(detalle.item.puede_administrar)}
          usuarioActualId={usuario?.id}
          onGuardado={alGuardarEntregable}
          onCerrar={cerrarDetalle}
        />
      )}

      {detalle?.tipo === "reunion" && !cargandoDetalle && (
        <ModalReunion
          proyectoId={detalle.item.proyecto_id}
          reunion={detalle.item}
          miembros={detalle.miembros}
          organizadorId={detalle.item.organizador_id}
          puedeAdministrar={Boolean(detalle.item.puede_editar)}
          equipoDisponible={equipo}
          onGuardado={alGuardarReunion}
          onCerrar={cerrarDetalle}
        />
      )}

      {/* "Tarea" y "Persona" comparten el mismo flujo de selección de
          persona (2026-08-21, a petición de Yue: usar la vista con
          buscador+avatares también al asignar una tarea, no solo desde la
          tarjeta "Persona") -- antes "Tarea" abría ModalAsignarTareaRapida
          directo con un <select> plano para elegir persona; ahora ambas
          tarjetas pasan primero por SelectorPersona. */}
      {(modalActivo === "tarea" || modalActivo === "persona") &&
        !personaElegida &&
        !cargandoEquipo && (
          <SelectorPersona
            equipo={equipo}
            error={errorEquipo}
            onElegir={setPersonaElegida}
            onCerrar={cerrarModal}
          />
        )}

      {(modalActivo === "tarea" || modalActivo === "persona") && personaElegida && (
        <ModalAsignarTareaRapida
          // personaElegida puede venir de un equipo anidado (2026-08-26,
          // ver SelectorPersona.jsx -- Bernardo desplegando el de David),
          // y no estar en `equipo` (la lista plana del propio Bernardo) --
          // se agrega aquí si hace falta para que ModalAsignarTareaRapida
          // encuentre sus `proyectos` al buscarla por id.
          equipo={
            equipo.some((m) => m.usuario_id === personaElegida.usuario_id)
              ? equipo
              : [...equipo, personaElegida]
          }
          personaInicialId={String(personaElegida.usuario_id)}
          onCerrar={cerrarModal}
          onCreado={alTerminarAsignacion}
        />
      )}

      {modalActivo === "proyecto" && (
        <ModalEditarProyecto onCerrar={cerrarModal} onGuardado={alTerminarAsignacion} />
      )}

      {modalActivo === "agenda" && (
        <Modal titulo="Agenda (calendario)" onCerrar={cerrarModal}>
          {/* Modal agrandado vía CSS (.modal-card:has(.planb__calendario),
              ver app.css) -- el calendario completo con su propio toolbar
              no cabe en el modal genérico (max-width: 480px) sin scroll
              feo anidado (reporte real de Yue). altoCalendario más generoso
              que el default de 600px para aprovechar el modal más grande. */}
          <div className="planb__calendario">
            <CalendarioGlobal altoCalendario={700} />
          </div>
        </Modal>
      )}

      {modalActivo === "rendimiento" && (
        <Modal titulo="Rendimiento del equipo" onCerrar={cerrarModal}>
          <RendimientoEquipo />
        </Modal>
      )}

      {mostrarApariencia && (
        <Modal titulo="Personalizar apariencia" onCerrar={() => setMostrarApariencia(false)}>
          <AppearanceSettings onCerrar={() => setMostrarApariencia(false)} />
        </Modal>
      )}

      {/* Asistente de voz "Chambeador" -- apagado por default para todos
          (2026-09-15, a petición de Yue: sin crédito en la cuenta de la
          API de Claude, cada intento tronaría). Desde 2026-09-17 se
          reactivó SOLO para David y su equipo (Ana, Iván, Juan José) vía
          el campo `usuario.asistente_voz_habilitado` (lista blanca
          manual, no un rol) -- ver Usuario.asistente_voz_habilitado en el
          backend. El mismo problema de crédito puede seguir afectando el
          piloto de "asignar tarea por WhatsApp" y el chatbot de consulta,
          que usan la misma API key; no se tocaron. */}
      {usuario?.asistente_voz_habilitado && (
        <FabAsistenteVoz proyectoIdContexto={null} />
      )}
    </div>
  );
}

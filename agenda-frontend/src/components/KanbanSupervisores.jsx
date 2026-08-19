import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { entregablesApi, proyectosApi } from "../api/endpoints";
import { useAuth } from "../context/AuthContext";
import { armarColumnasEquipo } from "../utils/equipoSupervisores";
import { fechaLocal, textoDiasRelativos } from "../utils/fechas";
import { etiquetaRol } from "../utils/rolLabels";
import ConfirmDialog from "./ConfirmDialog";
import EstatusBadge from "./EstatusBadge";
import FormularioEntregable from "./FormularioEntregable";
import HiloComentarios from "./HiloComentarios";
import PanelLateral from "./PanelLateral";
import SeccionEntregables from "./SeccionEntregables";
import SeccionNotas from "./SeccionNotas";

// Etiqueta en español del estatus de un entregable, para el badge de la
// columna Status (2026-08-19, a petición de Yue: "hay que poner la palabra
// en español"). "Vencido" pisa a "En progreso"/"Pendiente" como la
// condición más urgente de mostrar, igual que ya hacía el color del %.
function etiquetaEstatusEntregable(entregable, vencido) {
  if (entregable.estatus === "cumplido") return "Cumplido";
  if (vencido) return "Vencido";
  if (entregable.estatus === "en_progreso") return "En progreso";
  return "Pendiente";
}

// Solo la PRIMERA letra en mayúscula (2026-08-18, a petición de Yue) --
// nunca toca el resto del texto (no fuerza minúsculas ahí), así que
// nombres con siglas o mayúsculas intencionales (ej. "OCESA") no se ven
// afectados. Puramente visual, no cambia proyecto.proyecto_nombre guardado.
function primeraMayuscula(texto) {
  if (!texto) return texto;
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// Menú "⋮" con las acciones de un tema (Administrar/Editar/Eliminar) --
// 2026-08-17, reemplaza los 3 botones inline que se apretaban/desbordaban
// en pantallas angostas. Mismo patrón de overlay que ya usa
// BuscadorInvitados.jsx (position: absolute + .card), sin librería nueva.
function MenuAcciones({ acciones }) {
  const [abierto, setAbierto] = useState(false);
  if (acciones.length === 0) return null;

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        className="btn btn--ghost"
        style={{ fontSize: "0.75rem", padding: "2px 8px" }}
        onClick={() => setAbierto((a) => !a)}
        aria-label="Acciones del tema"
        aria-expanded={abierto}
      >
        ⋮
      </button>
      {abierto && (
        <>
          {/* Capa invisible para cerrar el menú al hacer clic afuera. */}
          <div
            style={{ position: "fixed", inset: 0, zIndex: 4 }}
            onClick={() => setAbierto(false)}
          />
          <div
            className="card"
            style={{
              position: "absolute",
              zIndex: 5,
              top: "100%",
              right: 0,
              marginTop: 4,
              padding: 4,
              minWidth: 140,
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            {acciones.map(({ etiqueta, onClick }) => (
              <button
                key={etiqueta}
                type="button"
                className="btn btn--ghost"
                style={{ width: "100%", justifyContent: "flex-start", textAlign: "left", fontSize: "0.8rem" }}
                onClick={() => {
                  setAbierto(false);
                  onClick();
                }}
              >
                {etiqueta}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// "Tu equipo" en tarjetas Kanban: una columna por cada persona directamente
// debajo de quien ve la pantalla (ver armarColumnasEquipo en
// utils/equipoSupervisores.js) — el CONTENIDO de cada columna son siempre
// PROYECTOS (con sus entregables/reuniones), nunca una lista de personas:
// si esa persona a su vez supervisa a un equipo, sus proyectos ya vienen
// agregados en una sola columna con su nombre (ej. Bernardo ve una columna
// "David" con los proyectos Cubo/Suit/Agenda Inteligente, no los nombres de
// Ana/Iván/Juan). La regla es la misma para cualquier nivel de la
// jerarquía, sin ramas especiales por rol — se ajusta sola conforme
// cambien personas o proyectos.
//
// `onAdministrar` es opcional: cuando se pasa (uso desde ResumenEquipo.jsx
// en /equipo), cada proyecto donde el viewer puede administrar (campo
// calculado en servidor `viewer_puede_administrar`, ver Fase 1 de
// jerarquía 2026-08-16 -- nunca se recalcula cruzando
// usuario.roles_por_proyecto, se rompe con herencia) muestra un botón
// "Administrar" que abre ModalEquipo — el Dashboard ("Tu equipo") no lo
// pasa y por tanto no muestra ese botón, sin cambio de comportamiento ahí.
//
// `soloTemas` (2026-08-17, Vista Equipo de /equipo): el Dashboard
// ("Tu equipo", vía DashboardSimplificado.jsx) sigue usando este mismo
// componente para mostrar entregables/reuniones inline con el árbol
// siempre expandido -- NO tocar ese comportamiento. Vista Equipo en
// cambio quiere el árbol colapsable mostrando solo temas/subtemas (los
// entregables se ven en Vista Estatus) más cajas de Avisos/Pendientes por
// persona; soloTemas=true activa ese modo sin afectar al Dashboard, que
// no pasa la prop.
// Arma un árbol a partir de la lista PLANA de proyectos que trae cada
// columna (ya viene con `parent_id` desde el backend, ver
// ProyectoDeMiembroOut en app/schemas/equipo_resumen.py). Un nodo cuyo
// `parent_id` no está en la propia lista (el padre no es visible para el
// viewer) se trata como raíz, para no perder proyectos de la vista.
// `temasResueltos` (2026-08-18, a petición de Yue -- "si se marcó como
// revisado, ocultarlo"): son los temas que YA tuvieron algo agendado en
// alguna junta y quedaron sin nada pendiente, mismo ciclo semanal que ya
// trabajan a mano. Un tema con un hijo que SÍ sigue pendiente no se pierde
// al filtrar -- si el padre queda fuera, el hijo se promueve a raíz (mismo
// criterio ya existente para "el padre no es visible para el viewer", ver
// comentario original de idsVisibles).
// `filtrosTemas` (2026-08-18, a petición de Yue -- "agregar filtros para que
// se filtren los temas por revisado, pendiente", estilo Mercado
// Libre/Amazon: checkboxes independientes, no botones excluyentes): Set con
// cualquier combinación de "pendientes"/"revisados". Antes SIEMPRE se
// ocultaban los resueltos, sin opción -- con solo "pendientes" marcado
// (default) se mantiene ese mismo comportamiento; marcar también
// "revisados" los suma a la vista (equivale a "todos"); desmarcar los dos
// no muestra nada (mismo criterio que un filtro de Amazon sin ninguna
// casilla marcada), ver MENSAJE_VACIO_POR_FILTRO.
function construirArbol(proyectos, temasResueltos, filtrosTemas) {
  let visibles = proyectos;
  if (temasResueltos && filtrosTemas) {
    const verPendientes = filtrosTemas.has("pendientes");
    const verRevisados = filtrosTemas.has("revisados");
    if (verPendientes && verRevisados) {
      visibles = proyectos;
    } else if (verPendientes) {
      visibles = proyectos.filter((p) => !temasResueltos.has(p.proyecto_id));
    } else if (verRevisados) {
      visibles = proyectos.filter((p) => temasResueltos.has(p.proyecto_id));
    } else {
      visibles = [];
    }
  }
  const idsVisibles = new Set(visibles.map((p) => p.proyecto_id));
  const hijosPorPadre = new Map();
  const raices = [];
  visibles.forEach((p) => {
    const esRaiz = !p.parent_id || !idsVisibles.has(p.parent_id);
    if (esRaiz) {
      raices.push(p);
    } else {
      if (!hijosPorPadre.has(p.parent_id)) hijosPorPadre.set(p.parent_id, []);
      hijosPorPadre.get(p.parent_id).push(p);
    }
  });
  // Orden de importancia (2026-08-18, a petición de Yue: "ordenar los
  // temas del más importante al menos importante") -- por `orden` (campo
  // global del tema, ver Proyecto.orden), no por el orden de llegada del
  // backend. Mismo criterio en raíces y en cada grupo de hijos.
  //
  // Revisados AL FONDO (2026-08-19, a petición de Yue: "al marcar
  // revisado, en vez de eliminarse de la vista, se hunde hasta abajo de la
  // tabla porque ya no es prioridad" -- sustituye el comportamiento previo
  // donde revisado significaba desaparecer del todo). Orden estable:
  // primero todos los NO resueltos (pendientes o sin agendar) ordenados
  // por `orden`, luego los resueltos, también por `orden` entre ellos. Si
  // `temasResueltos` viene vacío (Dashboard, que no pasa este dato), el
  // criterio "resuelto" nunca aplica y el orden queda igual que antes
  // (puro por `orden`).
  const comparador = (a, b) => {
    const aResuelto = temasResueltos && temasResueltos.has(a.proyecto_id) ? 1 : 0;
    const bResuelto = temasResueltos && temasResueltos.has(b.proyecto_id) ? 1 : 0;
    if (aResuelto !== bResuelto) return aResuelto - bResuelto;
    return a.orden - b.orden;
  };
  raices.sort(comparador);
  hijosPorPadre.forEach((hijos) => hijos.sort(comparador));
  return { raices, hijosPorPadre };
}

function NodoProyecto({
  proyecto,
  hijosPorPadre,
  onAdministrar,
  onEditarTema,
  onEliminarTema,
  nivel,
  soloTemas,
  expandidos,
  onToggle,
  pendientesRevision,
  onMarcarRevisado,
  marcandoRevisado,
  itemPorTemaResuelto,
  onMarcarPendiente,
  marcandoPendiente,
  // Flechas ↑/↓ para ordenar por importancia (2026-08-18, a petición de
  // Yue) -- `esPrimero`/`esUltimo` se calculan en el padre (ArbolProyectos
  // para raíces, aquí mismo para hijos) sobre la lista YA ORDENADA por
  // `orden`, así que reflejan la posición real dentro de sus hermanos
  // VISIBLES en esta columna. Ojo: el orden es GLOBAL por tema (todos los
  // hermanos con el mismo parent_id, no solo los que ve este viewer) -- si
  // hay hermanos que este viewer no puede ver, el límite mostrado aquí
  // puede no ser el límite real; en ese caso la flecha simplemente no hace
  // nada visible (mover_proyecto ya maneja el "ya está en el extremo" sin
  // error).
  esPrimero,
  esUltimo,
  onMoverTema,
  moviendoTema,
}) {
  const hoyIso = new Date().toISOString().slice(0, 10);
  const hijos = hijosPorPadre.get(proyecto.proyecto_id) || [];
  const tieneHijos = hijos.length > 0;
  // Fuera de Vista Equipo (Dashboard) el árbol sigue siempre expandido,
  // igual que antes -- el colapso por nodo es exclusivo de soloTemas.
  const colapsable = soloTemas && tieneHijos;
  const expandido = !colapsable || expandidos.has(proyecto.proyecto_id);
  // "Marcar revisado"/"Marcar pendiente" en el menú "⋮" (2026-08-18, a
  // petición de Yue: "marcar explícitamente si un tema quedó revisado y
  // otro pendiente") -- un tema nunca está en ambos estados a la vez
  // (pendientesRevision solo trae temas con algo activo, itemPorTemaResuelto
  // solo temas sin nada activo), así que como mucho una de las dos
  // acciones aparece. Disponibles sin importar viewer_puede_administrar --
  // mismo criterio ya usado por registrar_revision_agenda_item/
  // revertir_revision_tema en el backend: cualquier invitado a la junta
  // puede dejar constancia de qué se revisó, no solo N1/N2.
  const pendiente = soloTemas && pendientesRevision ? pendientesRevision[proyecto.proyecto_id] : null;
  const marcandoRev = marcandoRevisado === proyecto.proyecto_id;
  const itemResueltoId = soloTemas && itemPorTemaResuelto ? itemPorTemaResuelto[proyecto.proyecto_id] : null;
  const marcandoPend = marcandoPendiente === proyecto.proyecto_id;

  const accionesEstado = [
    pendiente && {
      etiqueta: marcandoRev ? "Marcando..." : "✅ Marcar revisado",
      onClick: () => onMarcarRevisado(proyecto.proyecto_id),
    },
    itemResueltoId && {
      etiqueta: marcandoPend ? "Marcando..." : "↩ Marcar pendiente",
      onClick: () => onMarcarPendiente(proyecto.proyecto_id),
    },
  ].filter(Boolean);

  const accionesAdmin = proyecto.viewer_puede_administrar
    ? [
        onAdministrar && {
          etiqueta: "Administrar",
          onClick: () => onAdministrar(proyecto.proyecto_id, proyecto.proyecto_nombre),
        },
        onEditarTema && {
          etiqueta: "Editar",
          onClick: () => onEditarTema(proyecto.proyecto_id),
        },
        onEliminarTema && {
          etiqueta: "Eliminar",
          onClick: () => onEliminarTema(proyecto.proyecto_id, proyecto.proyecto_nombre),
        },
      ].filter(Boolean)
    : [];

  // Etiqueta de status visible junto al nombre (2026-08-18, a petición de
  // Yue: "ponerle el status de pendiente" -- no solo inferible por en qué
  // filtro aparece o abriendo el menú "⋮"). Un tema que nunca se agregó a
  // ninguna junta no tiene ninguna de las dos etiquetas (no es "pendiente
  // de revisar" ni "revisado" -- sigue sin decidirse si se agenda).
  const statusTema = pendiente ? "pendiente" : itemResueltoId ? "revisado" : null;

  // Flechas ↑/↓ de orden (2026-08-18, a petición de Yue: "ordenar los temas
  // del más importante al menos importante") -- mismo permiso que
  // Administrar/Editar (N1/N2), así que se muestran junto a esas acciones.
  const moviendo = moviendoTema === proyecto.proyecto_id;

  return (
    <div style={nivel > 0 ? { marginLeft: 14, borderLeft: "2px solid var(--color-border)", paddingLeft: 10, marginTop: 6 } : undefined}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem", fontWeight: 600, color: "var(--color-text-muted)" }}>
          {colapsable && (
            <button
              type="button"
              className="btn btn--ghost"
              style={{ padding: "0 4px", fontSize: "0.7rem", lineHeight: 1.4 }}
              onClick={() => onToggle(proyecto.proyecto_id)}
              aria-expanded={expandido}
              aria-label={expandido ? "Colapsar tema" : "Expandir tema"}
            >
              {expandido ? "▼" : "▶"}
            </button>
          )}
          <Link to={`/proyectos/${proyecto.proyecto_id}`} style={{ color: "inherit", textDecoration: "none" }}>
            {primeraMayuscula(proyecto.proyecto_nombre)}
          </Link>
          {!soloTemas && proyecto.rol && <span style={{ fontWeight: 400 }}> ({etiquetaRol(proyecto.rol)})</span>}
          {statusTema && (
            <span
              style={{
                fontWeight: 600,
                fontSize: "0.68rem",
                textTransform: "uppercase",
                letterSpacing: "0.02em",
                padding: "1px 6px",
                borderRadius: 999,
                color: statusTema === "pendiente" ? "var(--color-warning)" : "var(--color-teal-600)",
                background: statusTema === "pendiente" ? "var(--color-warning-bg, #FBEFD9)" : "var(--color-success-bg)",
              }}
            >
              {statusTema === "pendiente" ? "Pendiente" : "Revisado"}
            </span>
          )}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {soloTemas && proyecto.viewer_puede_administrar && onMoverTema && (
            <>
              <button
                type="button"
                className="btn btn--ghost"
                style={{ padding: "0 4px", fontSize: "0.7rem" }}
                disabled={esPrimero || moviendo}
                onClick={() => onMoverTema(proyecto.proyecto_id, "arriba")}
                aria-label="Subir importancia"
                title="Subir importancia"
              >
                ↑
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                style={{ padding: "0 4px", fontSize: "0.7rem" }}
                disabled={esUltimo || moviendo}
                onClick={() => onMoverTema(proyecto.proyecto_id, "abajo")}
                aria-label="Bajar importancia"
                title="Bajar importancia"
              >
                ↓
              </button>
            </>
          )}
          <MenuAcciones acciones={[...accionesEstado, ...accionesAdmin]} />
        </span>
      </div>
      {!soloTemas && proyecto.entregables.length === 0 && proyecto.reuniones.length === 0 && (
        <p style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", margin: "2px 0" }}>
          Sin entregables ni reuniones aquí.
        </p>
      )}
      {!soloTemas &&
        proyecto.entregables.map((e) => {
          const vencido = e.estatus !== "cumplido" && e.fecha_entrega < hoyIso;
          return (
            <div key={`entregable-${e.id}`} style={{ padding: "3px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: "0.8rem" }}>
                <Link
                  to={`/proyectos/${proyecto.proyecto_id}?entregable=${e.id}`}
                  style={{ color: "inherit", textDecoration: "none", flex: 1 }}
                >
                  {vencido && "🔴 "}
                  {e.nombre}
                  {e.sensible && (
                    <span className="badge badge--sensible" style={{ marginLeft: 6, fontSize: "0.65rem" }}>
                      Sensible
                    </span>
                  )}
                </Link>
                <EstatusBadge estatus={e.estatus} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div className="progress-bar" style={{ flex: 1 }}>
                  <div className="progress-bar__fill" style={{ width: `${e.porcentaje_avance}%` }} />
                </div>
                <span style={{ fontSize: "0.7rem", color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
                  {fechaLocal(e.fecha_entrega).toLocaleDateString("es-MX", { dateStyle: "short" })} ·{" "}
                  {textoDiasRelativos(e.fecha_entrega)}
                </span>
              </div>
            </div>
          );
        })}
      {!soloTemas &&
        proyecto.reuniones.map((r) => (
          <Link
            key={`reunion-${r.id}`}
            to={`/proyectos/${proyecto.proyecto_id}?reunion=${r.id}`}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 8,
              fontSize: "0.8rem",
              padding: "2px 0",
              color: "var(--color-text-muted)",
              textDecoration: "none",
            }}
          >
            <span>🗓️ {r.titulo}</span>
            <span style={{ whiteSpace: "nowrap" }}>
              {new Date(r.fecha_inicio).toLocaleDateString("es-MX", { dateStyle: "short" })}
            </span>
          </Link>
        ))}
      {expandido &&
        hijos.map((h, idx) => (
          <NodoProyecto
            key={h.proyecto_id}
            proyecto={h}
            hijosPorPadre={hijosPorPadre}
            onAdministrar={onAdministrar}
            onEditarTema={onEditarTema}
            onEliminarTema={onEliminarTema}
            nivel={nivel + 1}
            soloTemas={soloTemas}
            expandidos={expandidos}
            onToggle={onToggle}
            pendientesRevision={pendientesRevision}
            onMarcarRevisado={onMarcarRevisado}
            marcandoRevisado={marcandoRevisado}
            itemPorTemaResuelto={itemPorTemaResuelto}
            onMarcarPendiente={onMarcarPendiente}
            marcandoPendiente={marcandoPendiente}
            esPrimero={idx === 0}
            esUltimo={idx === hijos.length - 1}
            onMoverTema={onMoverTema}
            moviendoTema={moviendoTema}
          />
        ))}
    </div>
  );
}

// ---------------------------------------------------------------------
// Vista Equipo en formato TABLA (2026-08-19, a petición de Yue, boceto a
// mano: una tabla por persona con columnas Tema/Subtema, Status,
// Accionables y Prioridad -- reemplaza el árbol de tarjetas SOLO cuando
// soloTemas=true; el Dashboard ("Tu equipo", soloTemas=false) sigue usando
// ArbolProyectos/NodoProyecto tal cual, sin tocar. Reutiliza
// construirArbol (mismo filtro/orden ya construido) -- solo cambia cómo se
// DIBUJA cada nodo (fila de tabla en vez de bloque con flex).
// ---------------------------------------------------------------------

// Botón de Accionables (2026-08-19, a petición de Yue -- ya no abre
// ventana flotante centrada: abre el PanelLateral con dos pestañas
// (Comentarios/Entregables, ver FilaTema) -- "que no rompan la vista que
// ya tenemos". Este botón solo alterna el estado `abierto` que le pasa el
// padre.
function BotonComentarios({ abierto, onToggle }) {
  return (
    <button
      type="button"
      className="btn btn--ghost"
      style={{ fontSize: "0.9rem", padding: "2px 6px" }}
      onClick={onToggle}
      aria-label="Comentarios y entregables del tema"
      aria-expanded={abierto}
      title="Comentarios y entregables"
    >
      💬
    </button>
  );
}

// Fila de alta rápida al inicio de cada tabla de persona (2026-08-19, a
// petición de Yue: "ir directamente a la tabla... y que se agregue al dar
// enter"). Crea el tema con al_frente=true (prioridad 1) y lo asigna a esa
// persona -- ver crearTemaRapido en ResumenEquipo.jsx. `placeholder`/
// `paddingLeft` (2026-08-19, a petición de Yue: "así como agregamos tema
// podamos agregar subtemas") -- FilaTema reutiliza esta misma fila,
// indentada, para "+ Agregar subtema" dentro de cada tema.
// `onCancelar` (2026-08-19, a petición de Yue: subtemas ahora arrancan
// colapsados en un "+" -- ver FilaTema -- así que esta fila necesita forma
// de volver a cerrarse sin crear nada: Escape o el botón "×"). Cuando se
// pasa, también autoenfoca el input al aparecer (abrir el "+" y no poder
// escribir de inmediato se sentiría roto).
function FilaNuevoTema({ onCrear, placeholder = "+ Agregar tema... (Enter para crear)", paddingLeft = 8, onCancelar }) {
  const [nombre, setNombre] = useState("");
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (onCancelar) inputRef.current?.focus();
  }, [onCancelar]);

  const handleKeyDown = async (e) => {
    if (e.key === "Escape" && onCancelar) {
      onCancelar();
      return;
    }
    if (e.key !== "Enter") return;
    e.preventDefault();
    const texto = nombre.trim();
    if (!texto || creando) return;
    setCreando(true);
    setError("");
    try {
      await onCrear(texto);
      setNombre("");
      if (onCancelar) onCancelar();
    } catch (err) {
      setError(err.response?.data?.detail || "No se pudo crear el tema.");
    } finally {
      setCreando(false);
    }
  };

  return (
    <tr className="tabla-temas__fila tabla-temas__fila--nueva">
      <td colSpan={4} style={{ padding: "4px 8px", paddingLeft }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            ref={inputRef}
            type="text"
            className="input"
            placeholder={placeholder}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={creando}
            style={{ border: "1px dashed var(--color-border)", fontSize: "0.85rem", flex: 1 }}
          />
          {onCancelar && (
            <button
              type="button"
              className="btn btn--ghost"
              style={{ padding: "2px 8px", fontSize: "0.8rem" }}
              onClick={onCancelar}
              aria-label="Cancelar"
              title="Cancelar"
            >
              ×
            </button>
          )}
        </span>
        {error && (
          <span className="error-text" style={{ fontSize: "0.75rem", display: "block", marginTop: 2 }}>
            {error}
          </span>
        )}
      </td>
    </tr>
  );
}

// Entregables anidados como filas bajo el tema (2026-08-19, a petición de
// Yue: "opción C" del boceto -- probarla EN PARALELO a la pestaña
// Entregables que ya vive en el panel 💬, para que el cliente compare
// cuál prefiere; ninguna reemplaza a la otra). Self-contenido: se fetchea
// solo (mismos endpoints que SeccionEntregables, pero mostrado como filas
// de tabla en vez de una lista dentro de un panel) al abrirse -- colapsado
// por default, mismo criterio que "+ Subtema" (no crecer la tabla hasta
// que se pide).
function FilaEntregables({ proyectoId, puedeAdministrar, paddingLeft }) {
  const { usuario } = useAuth();
  const [entregables, setEntregables] = useState([]);
  const [miembros, setMiembros] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [formulario, setFormulario] = useState(null); // "nuevo" | entregable | null
  const [notasAbiertasId, setNotasAbiertasId] = useState(null);
  const [eliminandoId, setEliminandoId] = useState(null);
  const [moviendoId, setMoviendoId] = useState(null);

  const cargar = () =>
    Promise.all([entregablesApi.listarPorProyecto(proyectoId), proyectosApi.equipo(proyectoId)])
      .then(([es, eq]) => {
        setEntregables(es);
        setMiembros(eq);
      })
      .catch(() => setError("No se pudieron cargar los entregables."))
      .finally(() => setCargando(false));

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyectoId]);

  const hoyIso = new Date().toISOString().slice(0, 10);

  const mover = async (entregableId, direccion) => {
    setMoviendoId(entregableId);
    try {
      await entregablesApi.mover(entregableId, direccion);
      await cargar();
    } catch {
      setError("No se pudo reordenar el entregable.");
    } finally {
      setMoviendoId(null);
    }
  };

  const confirmarEliminar = async () => {
    const id = eliminandoId;
    setEliminandoId(null);
    try {
      await entregablesApi.eliminar(id);
      await cargar();
    } catch {
      setError("No se pudo eliminar el entregable.");
    }
  };

  if (cargando) {
    return (
      <tr>
        <td colSpan={4} style={{ paddingLeft, fontSize: "0.78rem", color: "var(--color-text-muted)" }}>
          Cargando entregables...
        </td>
      </tr>
    );
  }

  return (
    <>
      {error && (
        <tr>
          <td colSpan={4} className="error-text" style={{ paddingLeft, fontSize: "0.78rem" }}>
            {error}
          </td>
        </tr>
      )}
      {entregables.map((e, idx) => {
        const vencido = e.estatus !== "cumplido" && e.fecha_entrega < hoyIso;
        const responsable = miembros.find((m) => m.usuario_id === e.responsable_id);
        const etiqueta = etiquetaEstatusEntregable(e, vencido);
        const colorEstado =
          etiqueta === "Cumplido"
            ? "var(--color-teal-600)"
            : etiqueta === "Vencido"
            ? "var(--color-danger)"
            : "var(--color-warning)";
        const fondoEstado =
          etiqueta === "Cumplido"
            ? "var(--color-success-bg)"
            : etiqueta === "Vencido"
            ? "var(--color-danger-bg, #FBE3E0)"
            : "var(--color-warning-bg, #FBEFD9)";
        const acciones = [
          { etiqueta: "Editar", onClick: () => setFormulario(e) },
          { etiqueta: "Eliminar", onClick: () => setEliminandoId(e.id) },
        ];

        return (
          <tr key={e.id} className="tabla-temas__fila">
            <td style={{ paddingLeft }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {puedeAdministrar && (
                  <span style={{ color: "var(--color-text-muted)", fontSize: "0.75rem" }}>└</span>
                )}
                📦 {e.nombre}
              </span>
              <span style={{ display: "block", fontSize: "0.72rem", color: "var(--color-text-muted)", marginLeft: puedeAdministrar ? 16 : 0 }}>
                {responsable?.nombre || "—"} · {vencido ? "Venció" : "Vence"} {textoDiasRelativos(e.fecha_entrega)}
              </span>
            </td>
            <td>
              <span
                style={{
                  fontWeight: 600,
                  fontSize: "0.68rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.02em",
                  padding: "2px 8px",
                  borderRadius: 999,
                  whiteSpace: "nowrap",
                  color: colorEstado,
                  background: fondoEstado,
                }}
              >
                {e.porcentaje_avance}% · {etiqueta}
              </span>
            </td>
            <td>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  className="tabla-temas__rank"
                  style={{ fontSize: "0.7rem", color: "var(--color-text-muted)", minWidth: 16, textAlign: "center" }}
                  title="Posición de importancia entre los entregables de este tema"
                >
                  {idx + 1}
                </span>
                {puedeAdministrar && (
                  <>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      style={{ padding: "0 4px", fontSize: "0.7rem" }}
                      disabled={idx === 0 || moviendoId === e.id}
                      onClick={() => mover(e.id, "arriba")}
                      aria-label="Subir importancia"
                      title="Subir importancia"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      style={{ padding: "0 4px", fontSize: "0.7rem" }}
                      disabled={idx === entregables.length - 1 || moviendoId === e.id}
                      onClick={() => mover(e.id, "abajo")}
                      aria-label="Bajar importancia"
                      title="Bajar importancia"
                    >
                      ↓
                    </button>
                  </>
                )}
              </span>
            </td>
            <td style={{ textAlign: "right" }}>
              <span style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
                <BotonComentarios
                  abierto={notasAbiertasId === e.id}
                  onToggle={() => setNotasAbiertasId((v) => (v === e.id ? null : e.id))}
                />
                <MenuAcciones acciones={puedeAdministrar ? acciones : []} />
              </span>
            </td>
            {notasAbiertasId === e.id && (
              <PanelLateral titulo={e.nombre} onCerrar={() => setNotasAbiertasId(null)}>
                <SeccionNotas entregableId={e.id} puedeAdministrar={puedeAdministrar} />
              </PanelLateral>
            )}
          </tr>
        );
      })}
      <tr className="tabla-temas__fila tabla-temas__fila--nueva">
        <td colSpan={4} style={{ padding: "2px 8px", paddingLeft }}>
          <button
            type="button"
            className="btn btn--ghost"
            style={{ fontSize: "0.75rem", padding: "1px 8px", color: "var(--color-text-muted)" }}
            onClick={() => setFormulario("nuevo")}
          >
            + Entregable
          </button>
        </td>
      </tr>
      {formulario && (
        <FormularioEntregable
          proyectoId={proyectoId}
          entregable={formulario === "nuevo" ? null : formulario}
          miembros={miembros}
          puedeAsignarAOtros={puedeAdministrar}
          usuarioActualId={usuario?.id}
          onGuardado={async () => {
            setFormulario(null);
            await cargar();
          }}
          onCerrar={() => setFormulario(null)}
        />
      )}
      {eliminandoId !== null && (
        <ConfirmDialog
          titulo="Eliminar entregable"
          mensaje="¿Eliminar este entregable? Esta acción no se puede deshacer."
          onConfirmar={confirmarEliminar}
          onCancelar={() => setEliminandoId(null)}
        />
      )}
    </>
  );
}

function FilaTema({
  proyecto,
  hijosPorPadre,
  nivel,
  expandidos,
  onToggle,
  onAdministrar,
  onEditarTema,
  onEliminarTema,
  pendientesRevision,
  onMarcarRevisado,
  marcandoRevisado,
  itemPorTemaResuelto,
  onMarcarPendiente,
  marcandoPendiente,
  onMoverTema,
  moviendoTema,
  esPrimero,
  esUltimo,
  posicion,
  onCrearSubtema,
}) {
  const hijos = hijosPorPadre.get(proyecto.proyecto_id) || [];
  const tieneHijos = hijos.length > 0;
  const expandido = !tieneHijos || expandidos.has(proyecto.proyecto_id);
  const [notasAbiertas, setNotasAbiertas] = useState(false);
  // Pestaña activa del panel lateral de Accionables (2026-08-19, a
  // petición de Yue: "hoy la única forma de ver/crear entregables es
  // entrando al tema" -- se agrega como segunda pestaña del mismo panel en
  // vez de un ícono aparte).
  const [pestanaPanel, setPestanaPanel] = useState("comentarios");
  // Colapsado por default (2026-08-19, a petición de Yue: "hace todo muy
  // grande" con la fila siempre abierta) -- arranca como un simple "+" y
  // solo se despliega el input al hacer clic.
  const [agregandoSubtema, setAgregandoSubtema] = useState(false);
  // "Opción C" de entregables (2026-08-19, a petición de Yue) -- ya no vive
  // en un ícono aparte (📦), se consolidó dentro del mismo "+" que subtemas
  // (2026-08-19: "en lugar de poner un icono nuevo podemos dejarlo dentro
  // del +, creo que seria mas limpio").
  const [entregablesAbiertos, setEntregablesAbiertos] = useState(false);
  // Menú de dos opciones que despliega el "+" (Subtema | Entregable).
  const [menuCrearAbierto, setMenuCrearAbierto] = useState(false);

  const pendiente = pendientesRevision ? pendientesRevision[proyecto.proyecto_id] : null;
  const marcandoRev = marcandoRevisado === proyecto.proyecto_id;
  const itemResueltoId = itemPorTemaResuelto ? itemPorTemaResuelto[proyecto.proyecto_id] : null;
  const marcandoPend = marcandoPendiente === proyecto.proyecto_id;
  const statusTema = pendiente ? "pendiente" : itemResueltoId ? "revisado" : null;
  const moviendo = moviendoTema === proyecto.proyecto_id;
  const marcandoStatus = marcandoRev || marcandoPend;

  // Clic directo en el badge de status alterna pendiente<->revisado
  // (2026-08-19, a petición de Yue: "sustituye" tener que abrir el menú
  // "⋮" -- un tema resuelto puede volver a pendiente con el mismo clic).
  // Sin acción si nunca se agendó a ninguna junta (statusTema null, nada
  // que alternar) -- ver comentario de statusTema arriba.
  const onClickStatus =
    statusTema === "pendiente"
      ? () => onMarcarRevisado(proyecto.proyecto_id)
      : statusTema === "revisado"
      ? () => onMarcarPendiente(proyecto.proyecto_id)
      : null;

  const accionesAdmin = proyecto.viewer_puede_administrar
    ? [
        // "Asignar persona" (2026-08-19, renombrado de "Administrar" a
        // petición de Yue -- misma acción, mismo ModalEquipo, solo más
        // claro desde la tabla de Vista Equipo).
        onAdministrar && {
          etiqueta: "Asignar persona",
          onClick: () => onAdministrar(proyecto.proyecto_id, proyecto.proyecto_nombre),
        },
        onEditarTema && { etiqueta: "Editar", onClick: () => onEditarTema(proyecto.proyecto_id) },
        onEliminarTema && {
          etiqueta: "Eliminar",
          onClick: () => onEliminarTema(proyecto.proyecto_id, proyecto.proyecto_nombre),
        },
      ].filter(Boolean)
    : [];

  return (
    <>
      <tr className="tabla-temas__fila">
        <td style={{ paddingLeft: 8 + nivel * 18 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {tieneHijos ? (
              <button
                type="button"
                className="btn btn--ghost"
                style={{ padding: "0 4px", fontSize: "0.7rem", lineHeight: 1.4 }}
                onClick={() => onToggle(proyecto.proyecto_id)}
                aria-expanded={expandido}
                aria-label={expandido ? "Colapsar tema" : "Expandir tema"}
              >
                {expandido ? "▼" : "▶"}
              </button>
            ) : (
              nivel > 0 && <span style={{ color: "var(--color-text-muted)", fontSize: "0.75rem" }}>└</span>
            )}
            <Link to={`/proyectos/${proyecto.proyecto_id}`} style={{ color: "inherit", textDecoration: "none", fontWeight: nivel === 0 ? 600 : 400 }}>
              {primeraMayuscula(proyecto.proyecto_nombre)}
            </Link>
            {/* "+" junto al nombre (2026-08-19, a petición de Yue) -- un solo
                gatillo que despliega "Subtema | Entregable" en vez de un
                ícono aparte para cada cosa ("en lugar de poner un icono
                nuevo podemos dejarlo dentro del +, creo que seria mas
                limpio"). No ocupa espacio propio: el menú/fila solo aparece
                mientras está activo. */}
            {proyecto.viewer_puede_administrar && onCrearSubtema && !agregandoSubtema && !menuCrearAbierto && (
              <button
                type="button"
                className="btn btn--ghost"
                style={{ padding: "0 5px", fontSize: "0.75rem", color: "var(--color-text-muted)", lineHeight: 1.4 }}
                onClick={() => setMenuCrearAbierto(true)}
                aria-label="Agregar subtema o entregable"
                title="Agregar subtema o entregable"
              >
                +
              </button>
            )}
            {menuCrearAbierto && (
              <span style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <button
                  type="button"
                  className="btn btn--ghost"
                  style={{ padding: "0 6px", fontSize: "0.72rem", color: "var(--color-text-muted)" }}
                  onClick={() => {
                    setAgregandoSubtema(true);
                    setMenuCrearAbierto(false);
                  }}
                >
                  + Subtema
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  style={{ padding: "0 6px", fontSize: "0.72rem", color: "var(--color-text-muted)" }}
                  onClick={() => {
                    setEntregablesAbiertos(true);
                    setMenuCrearAbierto(false);
                  }}
                >
                  + Entregable
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  style={{ padding: "0 4px", fontSize: "0.72rem", color: "var(--color-text-muted)" }}
                  onClick={() => setMenuCrearAbierto(false)}
                  aria-label="Cancelar"
                  title="Cancelar"
                >
                  ×
                </button>
              </span>
            )}
            {entregablesAbiertos && (
              <button
                type="button"
                className="btn btn--ghost"
                style={{ padding: "0 5px", fontSize: "0.75rem", color: "var(--color-text-muted)", lineHeight: 1.4 }}
                onClick={() => setEntregablesAbiertos(false)}
                aria-expanded={entregablesAbiertos}
                aria-label="Ocultar entregables"
                title="Ocultar entregables"
              >
                📦 ▾
              </button>
            )}
          </span>
        </td>
        <td>
          {statusTema ? (
            <button
              type="button"
              onClick={onClickStatus}
              disabled={marcandoStatus}
              title={statusTema === "pendiente" ? "Marcar como revisado" : "Volver a pendiente"}
              style={{
                fontWeight: 600,
                fontSize: "0.68rem",
                textTransform: "uppercase",
                letterSpacing: "0.02em",
                padding: "2px 8px",
                borderRadius: 999,
                whiteSpace: "nowrap",
                border: "none",
                cursor: marcandoStatus ? "default" : "pointer",
                color: statusTema === "pendiente" ? "var(--color-warning)" : "var(--color-teal-600)",
                background: statusTema === "pendiente" ? "var(--color-warning-bg, #FBEFD9)" : "var(--color-success-bg)",
              }}
            >
              {marcandoStatus ? "..." : statusTema === "pendiente" ? "Pendiente" : "Revisado"}
            </button>
          ) : (
            // Sin ítem de agenda real todavía (nunca agregado a una junta) --
            // se muestra igual como "Pendiente" (2026-08-19, a petición de
            // Yue: "todo tema nace pendiente"), pero sin acción de clic: no
            // hay ninguna reunión real de dónde colgar el archivado. En
            // cuanto se agende a una junta pasa a ser el badge de arriba,
            // clicable de verdad.
            <span
              title="Aún no agendado a ninguna junta"
              style={{
                fontWeight: 600,
                fontSize: "0.68rem",
                textTransform: "uppercase",
                letterSpacing: "0.02em",
                padding: "2px 8px",
                borderRadius: 999,
                whiteSpace: "nowrap",
                color: "var(--color-warning)",
                background: "var(--color-warning-bg, #FBEFD9)",
              }}
            >
              Pendiente
            </span>
          )}
        </td>
        <td>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              className="tabla-temas__rank"
              style={{ fontSize: "0.7rem", color: "var(--color-text-muted)", minWidth: 16, textAlign: "center" }}
              title="Posición de importancia entre sus hermanos"
            >
              {posicion}
            </span>
            {proyecto.viewer_puede_administrar && onMoverTema && (
              <>
                <button
                  type="button"
                  className="btn btn--ghost"
                  style={{ padding: "0 4px", fontSize: "0.7rem" }}
                  disabled={esPrimero || moviendo}
                  onClick={() => onMoverTema(proyecto.proyecto_id, "arriba")}
                  aria-label="Subir importancia"
                  title="Subir importancia"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  style={{ padding: "0 4px", fontSize: "0.7rem" }}
                  disabled={esUltimo || moviendo}
                  onClick={() => onMoverTema(proyecto.proyecto_id, "abajo")}
                  aria-label="Bajar importancia"
                  title="Bajar importancia"
                >
                  ↓
                </button>
              </>
            )}
          </span>
        </td>
        <td style={{ textAlign: "right" }}>
          <span style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
            <BotonComentarios abierto={notasAbiertas} onToggle={() => setNotasAbiertas((v) => !v)} />
            <MenuAcciones acciones={accionesAdmin} />
          </span>
        </td>
      </tr>
      {notasAbiertas && (
        <PanelLateral titulo={primeraMayuscula(proyecto.proyecto_nombre)} onCerrar={() => setNotasAbiertas(false)}>
          <div style={{ display: "flex", gap: 4, marginBottom: 12, borderBottom: "1px solid var(--color-border)" }}>
            {[
              { valor: "comentarios", etiqueta: "💬 Comentarios" },
              { valor: "entregables", etiqueta: "📦 Entregables" },
            ].map((tab) => (
              <button
                key={tab.valor}
                type="button"
                className="btn btn--ghost"
                onClick={() => setPestanaPanel(tab.valor)}
                style={{
                  fontSize: "0.82rem",
                  padding: "6px 10px",
                  borderRadius: 0,
                  borderBottom: `2px solid ${pestanaPanel === tab.valor ? "var(--color-teal-500)" : "transparent"}`,
                  color: pestanaPanel === tab.valor ? "var(--color-text)" : "var(--color-text-muted)",
                  fontWeight: pestanaPanel === tab.valor ? 600 : 400,
                }}
              >
                {tab.etiqueta}
              </button>
            ))}
          </div>
          {pestanaPanel === "comentarios" ? (
            <SeccionNotas proyectoId={proyecto.proyecto_id} puedeAdministrar={proyecto.viewer_puede_administrar} />
          ) : (
            <SeccionEntregables proyectoId={proyecto.proyecto_id} puedeAdministrar={proyecto.viewer_puede_administrar} />
          )}
        </PanelLateral>
      )}
      {expandido &&
        hijos.map((h, idx) => (
          <FilaTema
            key={h.proyecto_id}
            proyecto={h}
            hijosPorPadre={hijosPorPadre}
            nivel={nivel + 1}
            expandidos={expandidos}
            onToggle={onToggle}
            onAdministrar={onAdministrar}
            onEditarTema={onEditarTema}
            onEliminarTema={onEliminarTema}
            pendientesRevision={pendientesRevision}
            onMarcarRevisado={onMarcarRevisado}
            marcandoRevisado={marcandoRevisado}
            itemPorTemaResuelto={itemPorTemaResuelto}
            onMarcarPendiente={onMarcarPendiente}
            marcandoPendiente={marcandoPendiente}
            onMoverTema={onMoverTema}
            moviendoTema={moviendoTema}
            esPrimero={idx === 0}
            esUltimo={idx === hijos.length - 1}
            posicion={idx + 1}
            onCrearSubtema={onCrearSubtema}
          />
        ))}
      {/* Fila de input de "+ Agregar subtema" (2026-08-19, a petición de
          Yue: el gatillo ahora vive como un "+" junto al nombre del tema,
          arriba -- esta fila SOLO existe mientras agregandoSubtema está
          activo, cero espacio extra el resto del tiempo. */}
      {agregandoSubtema && onCrearSubtema && (
        <FilaNuevoTema
          onCrear={(nombre) => onCrearSubtema(proyecto.proyecto_id, nombre)}
          placeholder="Nombre del subtema... (Enter para crear)"
          paddingLeft={8 + (nivel + 1) * 18 + 20}
          onCancelar={() => setAgregandoSubtema(false)}
        />
      )}
      {entregablesAbiertos && (
        <FilaEntregables
          proyectoId={proyecto.proyecto_id}
          puedeAdministrar={proyecto.viewer_puede_administrar}
          paddingLeft={8 + (nivel + 1) * 18 + 20}
        />
      )}
    </>
  );
}

function TablaTemas({
  proyectos,
  onAdministrar,
  onEditarTema,
  onEliminarTema,
  expandidos,
  onToggle,
  pendientesRevision,
  onMarcarRevisado,
  marcandoRevisado,
  itemPorTemaResuelto,
  onMarcarPendiente,
  marcandoPendiente,
  onMoverTema,
  moviendoTema,
  temasResueltos,
  filtrosTemas,
  onCrearTema,
  onCrearSubtema,
}) {
  const { raices, hijosPorPadre } = construirArbol(proyectos, temasResueltos, filtrosTemas);

  if (raices.length === 0) {
    return (
      <div style={{ overflowX: "auto" }}>
        <table className="tabla-temas">
          <tbody>
            {onCrearTema && <FilaNuevoTema onCrear={onCrearTema} />}
            <tr>
              <td colSpan={4} style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", padding: "4px 8px" }}>
                {mensajeVacioPorFiltro(filtrosTemas)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="tabla-temas">
        <thead>
          <tr>
            <th>Tema</th>
            <th>Status</th>
            <th>
              Prioridad
              <span style={{ display: "block", fontWeight: 400, fontSize: "0.68rem", color: "var(--color-text-muted)", textTransform: "none" }}>
                ↑ más urgente
              </span>
            </th>
            <th style={{ textAlign: "right" }}>Accionables</th>
          </tr>
        </thead>
        <tbody>
          {onCrearTema && <FilaNuevoTema onCrear={onCrearTema} />}
          {raices.map((p, idx) => (
            <FilaTema
              key={p.proyecto_id}
              proyecto={p}
              hijosPorPadre={hijosPorPadre}
              nivel={0}
              expandidos={expandidos}
              onToggle={onToggle}
              onAdministrar={onAdministrar}
              onEditarTema={onEditarTema}
              onEliminarTema={onEliminarTema}
              pendientesRevision={pendientesRevision}
              onMarcarRevisado={onMarcarRevisado}
              marcandoRevisado={marcandoRevisado}
              itemPorTemaResuelto={itemPorTemaResuelto}
              onMarcarPendiente={onMarcarPendiente}
              marcandoPendiente={marcandoPendiente}
              onMoverTema={onMoverTema}
              moviendoTema={moviendoTema}
              esPrimero={idx === 0}
              esUltimo={idx === raices.length - 1}
              posicion={idx + 1}
              onCrearSubtema={onCrearSubtema}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function mensajeVacioPorFiltro(filtrosTemas) {
  if (!filtrosTemas || filtrosTemas.size === 0) {
    return "Selecciona al menos un filtro (Pendientes o Revisados) para ver temas.";
  }
  const verPendientes = filtrosTemas.has("pendientes");
  const verRevisados = filtrosTemas.has("revisados");
  if (verPendientes && verRevisados) return "Sin temas asignados todavía.";
  if (verRevisados) return "Nada revisado todavía con este filtro.";
  return "Sin temas pendientes por ahora -- todo lo agendado ya se revisó.";
}

function ArbolProyectos({
  proyectos,
  onAdministrar,
  onEditarTema,
  onEliminarTema,
  soloTemas,
  expandidos,
  onToggle,
  pendientesRevision,
  onMarcarRevisado,
  marcandoRevisado,
  itemPorTemaResuelto,
  onMarcarPendiente,
  marcandoPendiente,
  onMoverTema,
  moviendoTema,
  temasResueltos,
  filtrosTemas,
}) {
  const { raices, hijosPorPadre } = construirArbol(proyectos, temasResueltos, filtrosTemas);

  if (raices.length === 0) {
    return (
      <p style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", margin: "4px 0" }}>
        {mensajeVacioPorFiltro(filtrosTemas)}
      </p>
    );
  }

  return (
    <div className="stack" style={{ gap: 8, padding: "4px 0 4px 12px" }}>
      {raices.map((p, idx) => (
        <NodoProyecto
          key={p.proyecto_id}
          proyecto={p}
          hijosPorPadre={hijosPorPadre}
          onAdministrar={onAdministrar}
          onEditarTema={onEditarTema}
          onEliminarTema={onEliminarTema}
          nivel={0}
          soloTemas={soloTemas}
          expandidos={expandidos}
          onToggle={onToggle}
          pendientesRevision={pendientesRevision}
          onMarcarRevisado={onMarcarRevisado}
          marcandoRevisado={marcandoRevisado}
          itemPorTemaResuelto={itemPorTemaResuelto}
          onMarcarPendiente={onMarcarPendiente}
          marcandoPendiente={marcandoPendiente}
          esPrimero={idx === 0}
          esUltimo={idx === raices.length - 1}
          onMoverTema={onMoverTema}
          moviendoTema={moviendoTema}
        />
      ))}
    </div>
  );
}


// Caja "Avisos" o "Pendientes" de una persona en Vista Equipo -- ambos
// modelos (Nota/Pendiente) cuelgan de un proyecto_id (tema), no de una
// persona, así que agregar uno nuevo pide elegir a cuál de los temas de
// esa persona se asocia (preseleccionado si solo tiene uno).
function CajaLista({ titulo, items, temas, onAgregar, expandido, onToggle, tipoPadre }) {
  const [temaId, setTemaId] = useState(temas[0]?.proyecto_id ?? "");
  const [contenido, setContenido] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (temas.length > 0 && !temas.some((t) => t.proyecto_id === temaId)) {
      setTemaId(temas[0].proyecto_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [temas]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!contenido.trim() || !temaId || !onAgregar) return;
    setEnviando(true);
    setError("");
    try {
      await onAgregar(Number(temaId), contenido.trim());
      setContenido("");
    } catch (err) {
      setError(err.response?.data?.detail || `No se pudo agregar ${titulo.toLowerCase()}.`);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="stack" style={{ gap: 4, marginTop: 8 }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          color: "var(--color-text-muted)",
        }}
      >
        <h4 style={{ fontSize: "0.78rem", margin: 0 }}>
          {titulo} ({items.length})
        </h4>
        <span style={{ fontSize: "0.7rem" }}>{expandido ? "▲" : "▼"}</span>
      </button>
      {expandido && (
        <>
          {items.length === 0 ? (
            <p style={{ fontSize: "0.78rem", color: "var(--color-text-muted)", margin: 0 }}>
              Sin {titulo.toLowerCase()}.
            </p>
          ) : (
            <div
              className="stack"
              // Altura máxima + scroll interno (2026-08-18, a petición de
              // Yue: "entre más avisos/pendientes haya, más grande se ve" --
              // sin este tope, la caja crecía con el conteo de cada persona
              // y las columnas se veían disparejas). Con el tope, la caja
              // siempre ocupa el mismo espacio -- quien tenga más de lo que
              // cabe hace scroll adentro, en vez de estirar toda la tarjeta.
              style={{ gap: 4, maxHeight: 200, overflowY: "auto", paddingRight: 2 }}
            >
              {items.map((it) => (
                <div
                  key={it.id}
                  style={{
                    fontSize: "0.78rem",
                    padding: "6px 8px",
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-sm, 6px)",
                  }}
                >
                  {it.contenido}
                  {temas.length > 1 && (
                    <div style={{ color: "var(--color-text-muted)", fontSize: "0.72rem", marginTop: 2 }}>
                      {it.proyecto_nombre}
                    </div>
                  )}
                  <HiloComentarios
                    padreParams={tipoPadre === "nota" ? { nota_padre_id: it.id } : { pendiente_padre_id: it.id }}
                  />
                </div>
              ))}
            </div>
          )}
          {error && <p className="error-text" style={{ fontSize: "0.75rem", margin: 0 }}>{error}</p>}
          {onAgregar && temas.length > 0 && (
            <form onSubmit={handleSubmit} className="stack" style={{ gap: 4 }}>
              {temas.length > 1 && (
                <select
                  className="input"
                  value={temaId}
                  onChange={(e) => setTemaId(e.target.value)}
                  style={{ fontSize: "0.78rem" }}
                >
                  {temas.map((t) => (
                    <option key={t.proyecto_id} value={t.proyecto_id}>
                      {t.proyecto_nombre}
                    </option>
                  ))}
                </select>
              )}
              <div style={{ display: "flex", gap: 4 }}>
                <input
                  className="input"
                  style={{ fontSize: "0.78rem" }}
                  placeholder={`Agregar ${titulo.toLowerCase()}...`}
                  value={contenido}
                  onChange={(e) => setContenido(e.target.value)}
                />
                <button
                  className="btn btn--ghost"
                  type="submit"
                  disabled={enviando || !contenido.trim()}
                  style={{ fontSize: "0.75rem" }}
                >
                  +
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
}

function AvisosPendientesPersona({
  columna,
  notasPorProyecto,
  pendientesPorProyecto,
  onAgregarNota,
  onAgregarPendiente,
  avisosAbiertos,
  pendientesAbiertos,
  onToggleAvisos,
  onTogglePendientes,
}) {
  const avisos = columna.proyectos.flatMap((p) =>
    (notasPorProyecto[p.proyecto_id] || []).map((n) => ({ ...n, proyecto_nombre: p.proyecto_nombre }))
  );
  const pendientes = columna.proyectos.flatMap((p) =>
    (pendientesPorProyecto[p.proyecto_id] || []).map((pd) => ({ ...pd, proyecto_nombre: p.proyecto_nombre }))
  );

  return (
    // Ya NO se empuja al fondo con margin-top:auto (2026-08-18, revertido
    // a petición de Yue): con una diferencia grande de temas entre
    // personas -- ej. Jasso con 1 tema vs. Diana con 6 -- .kanban-column
    // estira todas las columnas a la altura de la más alta, y empujar este
    // bloque al fondo dejaba un hueco enorme en las columnas cortas, peor
    // que el desalineo original que se quiso arreglar. Ahora aparece en
    // flujo normal, justo debajo de la lista de temas de cada quien.
    // El expandir/colapsar de Avisos/Pendientes se mantiene COMPARTIDO
    // entre todas las columnas (estado en KanbanSupervisores, no aquí).
    <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 6, marginTop: 8 }}>
      <CajaLista
        titulo="Avisos"
        items={avisos}
        temas={columna.proyectos}
        onAgregar={onAgregarNota}
        expandido={avisosAbiertos}
        onToggle={onToggleAvisos}
        tipoPadre="nota"
      />
      <CajaLista
        titulo="Pendientes"
        items={pendientes}
        temas={columna.proyectos}
        onAgregar={onAgregarPendiente}
        expandido={pendientesAbiertos}
        onToggle={onTogglePendientes}
        tipoPadre="pendiente"
      />
    </div>
  );
}

function TarjetaColumna({
  columna,
  onAdministrar,
  onEditarTema,
  onEliminarTema,
  soloTemas,
  notasPorProyecto,
  pendientesPorProyecto,
  onAgregarNota,
  onAgregarPendiente,
  pendientesRevision,
  onMarcarRevisado,
  marcandoRevisado,
  itemPorTemaResuelto,
  onMarcarPendiente,
  marcandoPendiente,
  onMoverTema,
  moviendoTema,
  temasResueltos,
  filtrosTemas,
  avisosAbiertos,
  pendientesAbiertos,
  onToggleAvisos,
  onTogglePendientes,
  onCrearTema,
  onCrearSubtema,
}) {
  const hoyIso = new Date().toISOString().slice(0, 10);
  const vencidos = columna.proyectos.reduce(
    (acc, p) => acc + p.entregables.filter((e) => e.estatus !== "cumplido" && e.fecha_entrega < hoyIso).length,
    0
  );
  const [expandidos, setExpandidos] = useState(new Set());
  const toggle = (id) =>
    setExpandidos((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  // Columna completa colapsable (2026-08-17, a petición de Yue -- con
  // varios temas/avisos/pendientes por persona la lista se hacía muy
  // larga) -- mismo patrón ▼/▶ que ArbolProyectos. Abierta por default
  // desde 2026-08-18 (a petición de Yue: al entrar a Equipo debe verse
  // todo desplegado de una vez, sin tener que darle clic a cada persona) --
  // el botón sigue disponible para quien prefiera colapsar.
  const [abierta, setAbierta] = useState(true);

  return (
    <div className="kanban-column">
      <div className="kanban-column__header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Link to={`/perfil/${columna.usuario_id}`} style={{ color: "inherit" }}>
          {columna.nombre}
        </Link>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="kanban-column__contador">{columna.proyectos.length}</span>
          <button
            type="button"
            className="btn btn--ghost"
            style={{ padding: "0 4px", fontSize: "0.7rem" }}
            onClick={() => setAbierta((a) => !a)}
            aria-expanded={abierta}
            aria-label={abierta ? "Colapsar" : "Expandir"}
          >
            {abierta ? "▼" : "▶"}
          </button>
        </span>
      </div>
      {/* Resumen "N entregables vencidos" por persona oculto (2026-08-19, a
          petición de Yue: "por ahora no es necesario") -- ahora que cada
          entregable vencido ya se ve en su propia fila (badge "Vencido" en
          Status), este aviso arriba de la columna quedaba redundante.
          `vencidos` se deja calculado por si se vuelve a mostrar. */}
      {false && vencidos > 0 && (
        <p style={{ fontSize: "0.78rem", color: "var(--color-danger)", margin: "2px 0 6px" }}>
          🔴 {vencidos} entregable{vencidos === 1 ? "" : "s"} vencido{vencidos === 1 ? "" : "s"}
        </p>
      )}
      {abierta && (
        <>
          {soloTemas ? (
            // Sin gate por columna.proyectos.length -- TablaTemas siempre
            // muestra la fila "+ Agregar tema" arriba, incluso con la
            // columna vacía (mensajeVacioPorFiltro ya cubre el mensaje de
            // "sin temas" debajo de esa fila).
            <div className="kanban-column__lista">
              <TablaTemas
                proyectos={columna.proyectos}
                onAdministrar={onAdministrar}
                onEditarTema={onEditarTema}
                onEliminarTema={onEliminarTema}
                expandidos={expandidos}
                onToggle={toggle}
                pendientesRevision={pendientesRevision}
                onMarcarRevisado={onMarcarRevisado}
                marcandoRevisado={marcandoRevisado}
                itemPorTemaResuelto={itemPorTemaResuelto}
                onMarcarPendiente={onMarcarPendiente}
                marcandoPendiente={marcandoPendiente}
                onMoverTema={onMoverTema}
                moviendoTema={moviendoTema}
                temasResueltos={temasResueltos}
                filtrosTemas={filtrosTemas}
                onCrearTema={onCrearTema ? (nombre) => onCrearTema(columna.usuario_id, nombre) : undefined}
                onCrearSubtema={onCrearSubtema}
              />
            </div>
          ) : columna.proyectos.length > 0 ? (
            <div className="kanban-column__lista">
              <ArbolProyectos
                proyectos={columna.proyectos}
                onAdministrar={onAdministrar}
                onEditarTema={onEditarTema}
                onEliminarTema={onEliminarTema}
                soloTemas={soloTemas}
                expandidos={expandidos}
                onToggle={toggle}
                pendientesRevision={pendientesRevision}
                onMarcarRevisado={onMarcarRevisado}
                marcandoRevisado={marcandoRevisado}
                itemPorTemaResuelto={itemPorTemaResuelto}
                onMarcarPendiente={onMarcarPendiente}
                marcandoPendiente={marcandoPendiente}
                onMoverTema={onMoverTema}
                moviendoTema={moviendoTema}
                temasResueltos={temasResueltos}
                filtrosTemas={filtrosTemas}
              />
            </div>
          ) : (
            <p style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", margin: "4px 0" }}>
              Sin temas asignados todavía.
            </p>
          )}
          {/* Cajas "Avisos"/"Pendientes" por columna ocultas (2026-08-19, a
              petición de Yue) -- ya no tienen propósito: el ícono 💬 de
              Accionables cubre lo mismo (comentarios/imágenes), ahora por
              tema en vez de agregado por persona. AvisosPendientesPersona
              se queda sin usar, código intacto por si se necesita después. */}
        </>
      )}
    </div>
  );
}

export default function KanbanSupervisores({
  miembros,
  onAdministrar,
  onEditarTema,
  onEliminarTema,
  usuarioActualId,
  soloTemas = false,
  notasPorProyecto = {},
  pendientesPorProyecto = {},
  onAgregarNota,
  onAgregarPendiente,
  // Columnas del/los jefe(s) directo(s) del viewer (2026-08-18, a petición
  // de Yue: "se tiene que ver el jefe siempre, con el kanban de todos los
  // temas") -- ya vienen armadas con la misma forma que `columna` (ver
  // ResumenEquipo.jsx), se renderizan con el mismo TarjetaColumna que
  // cualquier otra, PRIMERO en el tablero. Independientes de
  // armarColumnasEquipo (que puede devolver 0 columnas -- ej. alguien sin
  // reportes -- sin que eso deba ocultar la caja del jefe).
  columnasExtra = [],
  // Botón "Marcar revisado" en el árbol de temas (2026-08-18, a petición
  // de Yue) -- pendientesRevision es un mapa proyecto_id -> {item_id,
  // reunion_id} (ver /equipo/pendientes-revision), onMarcarRevisado(proyectoId)
  // dispara la llamada real. Solo ResumenEquipo.jsx los pasa (Vista
  // Equipo); el Dashboard ("Tu equipo") no soloTemas, así que ahí ni se usan.
  pendientesRevision = {},
  onMarcarRevisado,
  marcandoRevisado = null,
  // Contraparte de lo anterior (2026-08-18, a petición de Yue: "Marcar
  // pendiente" explícito) -- itemPorTemaResuelto es un mapa
  // proyecto_id -> item_id (ver /equipo/temas-resueltos),
  // onMarcarPendiente(proyectoId) llama a revertir_revision_tema.
  itemPorTemaResuelto = {},
  onMarcarPendiente,
  marcandoPendiente = null,
  // Flechas ↑/↓ de orden de importancia (2026-08-18, a petición de Yue) --
  // onMoverTema(proyectoId, "arriba"|"abajo") llama a
  // proyectosApi.reordenar. Solo ResumenEquipo.jsx (Vista Equipo) los pasa.
  onMoverTema,
  moviendoTema = null,
  temasResueltos = new Set(),
  // Set con cualquier combinación de "pendientes"/"revisados" -- 2026-08-18,
  // a petición de Yue: checkboxes independientes (estilo Amazon/Mercado
  // Libre) para elegir qué ver en el árbol de temas, en vez de ocultar
  // siempre lo resuelto sin opción. Default: solo "pendientes" (mismo
  // comportamiento de siempre).
  filtrosTemas = new Set(["pendientes"]),
  // Alta rápida de tema desde la fila "+ Agregar tema" de cada tabla
  // (2026-08-19, a petición de Yue) -- onCrearTema(usuarioId, nombre),
  // usuarioId es columna.usuario_id (la persona dueña de esa tabla). Solo
  // ResumenEquipo.jsx lo pasa.
  onCrearTema,
  // "+ Agregar subtema" dentro de cada tema (2026-08-19, a petición de
  // Yue: "así como agregamos tema podamos agregar subtemas", sin entrar al
  // tema) -- onCrearSubtema(parentId, nombre). A diferencia de onCrearTema,
  // no depende de la columna/persona -- el subtema hereda visibilidad del
  // padre (mismo mecanismo ya usado por incluir_heredado en
  // listar_equipo_visible).
  onCrearSubtema,
  // Buscador de personas (2026-08-19, a petición de Yue: "si solo quiero
  // ver los pendientes o temas de una sola persona no quiero tener que
  // navegar por toda la vista") -- oculta las columnas cuyo nombre no
  // incluye el texto buscado (case-insensitive), en vez de solo
  // resaltarlas. Vacío = sin filtro, todas visibles (comportamiento de
  // siempre).
  filtroPersona = "",
}) {
  // Compartido entre TODAS las columnas de esta vista (2026-08-18, a
  // petición de Yue: expandir Avisos/Pendientes de una sola persona la
  // hacía crecer mientras las demás columnas se quedaban con espacio vacío
  // abajo, descuadrado) -- un solo clic en cualquier columna expande/
  // colapsa la misma sección en todas a la vez, así crecen juntas.
  const [avisosAbiertos, setAvisosAbiertos] = useState(false);
  const [pendientesAbiertos, setPendientesAbiertos] = useState(false);

  const columnas = armarColumnasEquipo(miembros, usuarioActualId);

  // Vista Equipo (soloTemas) es la vista de "mi equipo", no la mía propia
  // -- quien ve la pantalla NUNCA se muestra a sí mismo ahí (2026-08-17, a
  // petición de Yue: Bernardo no debe ver sus propios temas en esta
  // pantalla, solo los de David/Diana/Jasso) -- sus propios temas siguen
  // disponibles en /perfil, esta pantalla es sobre el equipo.
  let columnasPropias = soloTemas
    ? columnas.filter((c) => c.usuario_id !== usuarioActualId)
    : columnas;

  const textoBusqueda = filtroPersona.trim().toLowerCase();
  const columnaCoincide = (c) => c.nombre.toLowerCase().includes(textoBusqueda);
  let columnasExtraFiltradas = columnasExtra;
  if (textoBusqueda) {
    columnasPropias = columnasPropias.filter(columnaCoincide);
    columnasExtraFiltradas = columnasExtra.filter(columnaCoincide);
  }

  const tarjetaProps = {
    onAdministrar,
    onEditarTema,
    onEliminarTema,
    soloTemas,
    notasPorProyecto,
    pendientesPorProyecto,
    onAgregarNota,
    onAgregarPendiente,
    pendientesRevision,
    onMarcarRevisado,
    marcandoRevisado,
    itemPorTemaResuelto,
    onMarcarPendiente,
    marcandoPendiente,
    onMoverTema,
    moviendoTema,
    temasResueltos,
    filtrosTemas,
    avisosAbiertos,
    pendientesAbiertos,
    onToggleAvisos: () => setAvisosAbiertos((v) => !v),
    onTogglePendientes: () => setPendientesAbiertos((v) => !v),
    onCrearTema,
    onCrearSubtema,
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      {/* Caja(s) del jefe -- ANCHA, en su propia fila arriba del tablero,
          nunca metida como una columna más junto a los subordinados
          (2026-08-18, a petición de Yue: "la caja del jefe debe quedar
          arriba, y debajo los subordinados"). Cada una en su propio
          kanban-board de un solo elemento para que ocupe el 100% del
          ancho (mismo comportamiento ya usado cuando una columna está
          sola, ver .kanban-column sin min-width fijo del padre). */}
      {columnasExtraFiltradas.map((c) => (
        <div className="kanban-responsive" key={c.usuario_id}>
          <div className={`kanban-board${soloTemas ? " kanban-board--vertical" : ""}`}>
            <TarjetaColumna columna={c} {...tarjetaProps} />
          </div>
        </div>
      ))}
      {columnasPropias.length > 0 && (
        <div className="kanban-responsive">
          <div className={`kanban-board${soloTemas ? " kanban-board--vertical" : ""}`}>
            {columnasPropias.map((c) => (
              <TarjetaColumna key={c.usuario_id} columna={c} {...tarjetaProps} />
            ))}
          </div>
        </div>
      )}
      {columnasExtraFiltradas.length === 0 && columnasPropias.length === 0 && (
        <p style={{ color: "var(--color-text-muted)" }}>
          {textoBusqueda
            ? `Nadie coincide con "${filtroPersona.trim()}".`
            : "No tienes equipo visible en ningún tema todavía."}
        </p>
      )}
    </div>
  );
}

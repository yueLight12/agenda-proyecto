import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { armarColumnasEquipo } from "../utils/equipoSupervisores";
import { fechaLocal, textoDiasRelativos } from "../utils/fechas";
import { etiquetaRol } from "../utils/rolLabels";
import EstatusBadge from "./EstatusBadge";
import HiloComentarios from "./HiloComentarios";

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
// revisado, ocultarlo"): oculta del árbol los temas que YA tuvieron algo
// agendado en alguna junta y quedaron sin nada pendiente, mismo ciclo
// semanal que ya trabajan a mano (lo resuelto sale de la vista hasta que
// algo nuevo quede pendiente ahí). Un tema con un hijo que SÍ sigue
// pendiente no se pierde -- si el padre se oculta, el hijo se promueve a
// raíz (mismo criterio ya existente para "el padre no es visible para el
// viewer", ver comentario original de idsVisibles).
function construirArbol(proyectos, temasResueltos) {
  const visibles = temasResueltos ? proyectos.filter((p) => !temasResueltos.has(p.proyecto_id)) : proyectos;
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
}) {
  const hoyIso = new Date().toISOString().slice(0, 10);
  const hijos = hijosPorPadre.get(proyecto.proyecto_id) || [];
  const tieneHijos = hijos.length > 0;
  // Fuera de Vista Equipo (Dashboard) el árbol sigue siempre expandido,
  // igual que antes -- el colapso por nodo es exclusivo de soloTemas.
  const colapsable = soloTemas && tieneHijos;
  const expandido = !colapsable || expandidos.has(proyecto.proyecto_id);
  // Botón "Marcar revisado" (2026-08-18, a petición de Yue: poder
  // marcarlo directo desde Vista Equipo, sin ir a buscar la reunión) --
  // solo aparece si este tema tiene algo pendiente de revisar en alguna
  // junta donde el usuario puede editarla (ver /equipo/pendientes-revision).
  const pendiente = soloTemas && pendientesRevision ? pendientesRevision[proyecto.proyecto_id] : null;
  const marcando = marcandoRevisado === proyecto.proyecto_id;

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
          <Link to={`/proyectos/${proyecto.proyecto_id}`} style={{ color: "inherit" }}>
            {proyecto.proyecto_nombre}
          </Link>
          {!soloTemas && proyecto.rol && <span style={{ fontWeight: 400 }}> ({etiquetaRol(proyecto.rol)})</span>}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {pendiente && (
            <button
              type="button"
              className="btn btn--ghost"
              style={{ fontSize: "0.72rem", padding: "2px 8px", whiteSpace: "nowrap" }}
              disabled={marcando}
              onClick={() => onMarcarRevisado(proyecto.proyecto_id)}
            >
              {marcando ? "Marcando..." : "✅ Marcar revisado"}
            </button>
          )}
          <MenuAcciones
          acciones={
            proyecto.viewer_puede_administrar
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
              : []
          }
          />
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
        hijos.map((h) => (
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
          />
        ))}
    </div>
  );
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
  temasResueltos,
}) {
  const { raices, hijosPorPadre } = construirArbol(proyectos, temasResueltos);

  if (raices.length === 0) {
    return (
      <p style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", margin: "4px 0" }}>
        Sin temas pendientes por ahora -- todo lo agendado ya se revisó.
      </p>
    );
  }

  return (
    <div className="stack" style={{ gap: 8, padding: "4px 0 4px 12px" }}>
      {raices.map((p) => (
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
    // margin-top: auto -- empuja este bloque al fondo de la tarjeta
    // (2026-08-18, a petición de Yue: con distinto número de temas por
    // persona, Avisos/Pendientes quedaba a distinta altura entre columnas;
    // .kanban-column ya estira todas las tarjetas a la misma altura, esto
    // hace que el bloque quede siempre alineado en la misma fila abajo).
    // El expandir/colapsar de Avisos/Pendientes es COMPARTIDO entre todas
    // las columnas de la vista (estado en KanbanSupervisores, no aquí) --
    // sin esto, expandir el de una sola persona la hacía crecer mientras
    // las demás se quedaban con espacio vacío abajo, descuadrado (2026-08-18,
    // reportado por Yue).
    <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 6, marginTop: "auto" }}>
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
  temasResueltos,
  avisosAbiertos,
  pendientesAbiertos,
  onToggleAvisos,
  onTogglePendientes,
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
      {vencidos > 0 && (
        <p style={{ fontSize: "0.78rem", color: "var(--color-danger)", margin: "2px 0 6px" }}>
          🔴 {vencidos} entregable{vencidos === 1 ? "" : "s"} vencido{vencidos === 1 ? "" : "s"}
        </p>
      )}
      {abierta && (
        <>
          {columna.proyectos.length > 0 ? (
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
                temasResueltos={temasResueltos}
              />
            </div>
          ) : (
            <p style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", margin: "4px 0" }}>
              Sin temas asignados todavía.
            </p>
          )}
          {soloTemas && columna.proyectos.length > 0 && (
            <AvisosPendientesPersona
              columna={columna}
              notasPorProyecto={notasPorProyecto}
              pendientesPorProyecto={pendientesPorProyecto}
              onAgregarNota={onAgregarNota}
              onAgregarPendiente={onAgregarPendiente}
              avisosAbiertos={avisosAbiertos}
              pendientesAbiertos={pendientesAbiertos}
              onToggleAvisos={onToggleAvisos}
              onTogglePendientes={onTogglePendientes}
            />
          )}
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
  temasResueltos = new Set(),
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
  const columnasPropias = soloTemas
    ? columnas.filter((c) => c.usuario_id !== usuarioActualId)
    : columnas;

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
    temasResueltos,
    avisosAbiertos,
    pendientesAbiertos,
    onToggleAvisos: () => setAvisosAbiertos((v) => !v),
    onTogglePendientes: () => setPendientesAbiertos((v) => !v),
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
      {columnasExtra.map((c) => (
        <div className="kanban-responsive" key={c.usuario_id}>
          <div className="kanban-board">
            <TarjetaColumna columna={c} {...tarjetaProps} />
          </div>
        </div>
      ))}
      {columnasPropias.length > 0 && (
        <div className="kanban-responsive">
          <div className="kanban-board">
            {columnasPropias.map((c) => (
              <TarjetaColumna key={c.usuario_id} columna={c} {...tarjetaProps} />
            ))}
          </div>
        </div>
      )}
      {columnasExtra.length === 0 && columnasPropias.length === 0 && (
        <p style={{ color: "var(--color-text-muted)" }}>
          No tienes equipo visible en ningún tema todavía.
        </p>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { entregablesApi, proyectosApi, reunionesApi, seriesReunionApi } from "../api/endpoints";
import EstatusBadge from "../components/EstatusBadge";
import Breadcrumb from "../components/Breadcrumb";
import CalendarioEntregables from "../components/CalendarioEntregables";
import KanbanEntregables from "../components/KanbanEntregables";
import ConfirmDialog from "../components/ConfirmDialog";
import FormularioEntregable from "../components/FormularioEntregable";
import ModalEditarProyecto from "../components/ModalEditarProyecto";
import ModalEquipo from "../components/ModalEquipo";
import ModalHistorial from "../components/ModalHistorial";
import ModalReunion from "../components/ModalReunion";
import ModalMinuta from "../components/ModalMinuta";
import ModalSerieReunion from "../components/ModalSerieReunion";
import SeccionNotas from "../components/SeccionNotas";
import { etiquetaRol } from "../utils/rolLabels";
import { useAuth } from "../context/AuthContext";

export default function TableroProyecto() {
  const { proyectoId } = useParams();
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [proyecto, setProyecto] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [entregables, setEntregables] = useState([]);
  const [reuniones, setReuniones] = useState([]);
  const [series, setSeries] = useState([]);
  const [equipo, setEquipo] = useState([]);
  const [ancestros, setAncestros] = useState([]);
  const [subtemas, setSubtemas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [editandoId, setEditandoId] = useState(null);
  const [valorEdicion, setValorEdicion] = useState(0);
  const [modalEntregable, setModalEntregable] = useState(null); // null | "nuevo" | entregable a editar
  const [modalReunion, setModalReunion] = useState(null); // null | "nueva" | reunion a editar
  const [modalSerie, setModalSerie] = useState(null); // null | "nueva" | serie a editar
  const [mostrarModalEquipo, setMostrarModalEquipo] = useState(false);
  const [modalSubtema, setModalSubtema] = useState(false);
  const [modalEditarTema, setModalEditarTema] = useState(false);
  const [confirmandoEliminarTema, setConfirmandoEliminarTema] = useState(false);
  const [resumenEliminarTema, setResumenEliminarTema] = useState(null);
  const [eliminandoTema, setEliminandoTema] = useState(false);
  const [errorEliminarTema, setErrorEliminarTema] = useState("");
  const [reunionMinuta, setReunionMinuta] = useState(null);
  const [entregableHistorial, setEntregableHistorial] = useState(null);
  const [error, setError] = useState("");
  const [errorAvance, setErrorAvance] = useState("");
  const [vista, setVista] = useState("tabla"); // "tabla" | "calendario" | "kanban"

  // Calculado en servidor (rol_efectivo/puede_administrar ya consideran
  // herencia desde un ancestro -- ver Fase 1 de jerarquía, 2026-08-16).
  // Nunca cruzar usuario.roles_por_proyecto aquí, se rompe en un subtema
  // cuyo permiso viene heredado de un nodo padre.
  const puedeAdministrar = Boolean(proyecto?.puede_administrar);

  const cargarTodo = async () => {
    const [p, r, e, eq, reu, anc, hijos, ser] = await Promise.all([
      proyectosApi.obtener(proyectoId),
      proyectosApi.resumen(proyectoId),
      entregablesApi.listarPorProyecto(proyectoId),
      proyectosApi.equipo(proyectoId),
      reunionesApi.listarPorProyecto(proyectoId),
      proyectosApi.ancestros(proyectoId),
      proyectosApi.hijos(proyectoId),
      seriesReunionApi.listar(proyectoId),
    ]);
    setProyecto(p);
    setResumen(r);
    setEntregables(e);
    setEquipo(eq);
    setReuniones(reu);
    setAncestros(anc);
    setSubtemas(hijos);
    setSeries(ser);
    return { entregables: e, reuniones: reu };
  };

  useEffect(() => {
    setCargando(true);
    setError("");
    cargarTodo()
      .then(({ entregables: e, reuniones: reu }) => {
        // Deep-link desde "Tu equipo"/Dashboard: ?entregable=ID o ?reunion=ID
        // abre directo el modal del ítem en vez de dejar al usuario en la
        // vista Tabla por defecto teniendo que rebuscarlo.
        const entregableId = searchParams.get("entregable");
        const reunionId = searchParams.get("reunion");
        if (entregableId) {
          const encontrado = e.find((x) => x.id === Number(entregableId));
          if (encontrado) setModalEntregable(encontrado);
        } else if (reunionId) {
          const encontrada = reu.find((x) => x.id === Number(reunionId));
          if (encontrada) setModalReunion(encontrada);
        }
        if (entregableId || reunionId) {
          setSearchParams({}, { replace: true });
        }
      })
      .catch(() => setError("No se pudo cargar el tema. Intenta de nuevo más tarde."))
      .finally(() => setCargando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyectoId]);

  const guardarAvance = async (entregableId) => {
    setErrorAvance("");
    try {
      await entregablesApi.actualizarAvance(entregableId, Number(valorEdicion));
      setEditandoId(null);
      await cargarTodo();
    } catch {
      setErrorAvance("No se pudo guardar el avance. Intenta de nuevo.");
    }
  };

  const reprogramarEntregable = async (entregable, nuevaFecha) => {
    await entregablesApi.actualizar(entregable.id, { fecha_entrega: nuevaFecha });
    await cargarTodo();
  };

  const moverEstatusKanban = async (entregable, porcentajeObjetivo) => {
    setErrorAvance("");
    try {
      await entregablesApi.actualizarAvance(entregable.id, porcentajeObjetivo);
      await cargarTodo();
    } catch {
      setErrorAvance("No se pudo mover el entregable. Intenta de nuevo.");
    }
  };

  const abrirConfirmarEliminarTema = async () => {
    setErrorEliminarTema("");
    try {
      const r = subtemas.length > 0 ? await proyectosApi.resumenSubarbol(proyectoId) : null;
      setResumenEliminarTema(r);
      setConfirmandoEliminarTema(true);
    } catch {
      setErrorEliminarTema("No se pudo preparar la eliminación. Intenta de nuevo.");
    }
  };

  const confirmarEliminarTema = async () => {
    setEliminandoTema(true);
    setErrorEliminarTema("");
    try {
      await proyectosApi.eliminar(proyectoId);
      const destino = ancestros.length > 0 ? `/proyectos/${ancestros[ancestros.length - 1].id}` : "/proyectos";
      navigate(destino);
    } catch (err) {
      setErrorEliminarTema(err.response?.data?.detail || "No se pudo eliminar este tema.");
      setEliminandoTema(false);
      setConfirmandoEliminarTema(false);
    }
  };

  if (cargando) return <p>Cargando tema...</p>;
  if (error) return <p className="error-text">{error}</p>;

  return (
    <div className="stack">
      <Breadcrumb ancestros={ancestros} actual={proyecto?.nombre} />

      <div className="topbar">
        <h1>{proyecto?.nombre}</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            <button
              className={vista === "tabla" ? "btn btn--primary" : "btn btn--ghost"}
              onClick={() => setVista("tabla")}
            >
              Tabla
            </button>
            {/* Calendario/Kanban ocultos a petición de Yue (2026-08-17) -- el
                código sigue abajo intacto (estado `vista`, bloques de render,
                componentes), reactivar es solo devolver estos dos botones. */}
          </div>
          {puedeAdministrar && (
            <button className="btn btn--ghost" onClick={() => setMostrarModalEquipo(true)}>
              Administrar equipo
            </button>
          )}
          {puedeAdministrar && (
            <button className="btn btn--ghost" onClick={() => setModalSubtema(true)}>
              Nuevo subtema
            </button>
          )}
          {puedeAdministrar && (
            <button className="btn btn--ghost" onClick={() => setModalEditarTema(true)}>
              Editar tema
            </button>
          )}
          {puedeAdministrar && ancestros.length > 0 && (
            <button
              className="btn btn--ghost"
              style={{ color: "var(--color-danger)" }}
              onClick={abrirConfirmarEliminarTema}
            >
              Eliminar tema
            </button>
          )}
          <button className="btn btn--primary" onClick={() => setModalEntregable("nuevo")}>
            {puedeAdministrar ? "Nuevo entregable" : "Agregarme una tarea"}
          </button>
          <button className="btn btn--ghost" onClick={() => setModalReunion("nueva")}>
            Nueva reunión
          </button>
          <button className="btn btn--ghost" onClick={() => setModalSerie("nueva")}>
            Nueva junta recurrente
          </button>
        </div>
      </div>

      {errorEliminarTema && <p className="error-text">{errorEliminarTema}</p>}

      {(subtemas.length > 0 || puedeAdministrar) && (
        <div className="card">
          <div className="list-inline" style={{ borderBottom: "none", paddingBottom: 0 }}>
            <h3 style={{ fontSize: "0.95rem", margin: 0 }}>Subtemas</h3>
          </div>
          {subtemas.length === 0 && (
            <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
              Este tema todavía no tiene subtemas.
            </p>
          )}
          {subtemas.length > 0 && (
            <div className="kanban-responsive">
              <div className="kanban-board">
                {subtemas.map((s) => (
                  <Link
                    key={s.id}
                    to={`/proyectos/${s.id}`}
                    className="kanban-column"
                    style={{ color: "inherit", textDecoration: "none" }}
                  >
                    <div className="kanban-column__header">
                      <span>{s.nombre}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      {s.rol_efectivo && (
                        <span className="kanban-column__contador" style={{ fontSize: "0.7rem" }}>
                          {etiquetaRol(s.rol_efectivo)}
                        </span>
                      )}
                      {s.tiene_hijos && (
                        <span style={{ fontSize: "0.7rem", color: "var(--color-text-muted)" }}>
                          tiene subtemas
                        </span>
                      )}
                    </div>
                    {s.descripcion && (
                      <p style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", margin: 0 }}>
                        {s.descripcion}
                      </p>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <SeccionNotas proyectoId={proyecto?.id} puedeAdministrar={puedeAdministrar} />
      </div>

      {resumen && (
        <div className="grid-summary">
          <div className="stat">
            <div className="stat__value">{resumen.porcentaje_avance_global}%</div>
            <div className="stat__label">Avance global (según tu visibilidad)</div>
          </div>
          <div className="stat">
            <div className="stat__value">{resumen.entregables_proximos_a_vencer}</div>
            <div className="stat__label">Próximos a vencer</div>
          </div>
          <div className="stat">
            <div className="stat__value">{resumen.entregables_vencidos}</div>
            <div className="stat__label">Vencidos</div>
          </div>
          <div className="stat">
            <div className="stat__value">{resumen.entregables_cumplidos}</div>
            <div className="stat__label">Cumplidos</div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="list-inline" style={{ borderBottom: "none", paddingBottom: 0 }}>
          <h3 style={{ fontSize: "0.95rem", margin: 0 }}>Próximas reuniones</h3>
        </div>
        {reuniones.length === 0 && (
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
            No tienes reuniones agendadas en este tema.
          </p>
        )}
        {[...reuniones]
          .sort((a, b) => new Date(a.fecha_inicio) - new Date(b.fecha_inicio))
          .map((r) => (
            <div className="list-inline" key={r.id}>
              <div style={{ cursor: "pointer" }} onClick={() => setModalReunion(r)}>
                <strong>{r.titulo}</strong>{" "}
                <span style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
                  {new Date(r.fecha_inicio).toLocaleString("es-MX", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}{" "}
                  — organiza {r.organizador_nombre}
                </span>
              </div>
              <button
                className="btn btn--ghost"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setReunionMinuta(r);
                }}
              >
                Minuta
              </button>
            </div>
          ))}
      </div>

      {series.length > 0 && (
        <div className="card">
          <div className="list-inline" style={{ borderBottom: "none", paddingBottom: 0 }}>
            <h3 style={{ fontSize: "0.95rem", margin: 0 }}>Juntas recurrentes</h3>
          </div>
          {series.map((s) => (
            <div
              className="list-inline"
              key={s.id}
              style={{ cursor: "pointer" }}
              onClick={() => setModalSerie(s)}
            >
              <div>
                <strong>{s.titulo}</strong>{" "}
                <span style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
                  todos los{" "}
                  {["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"][s.dia_semana]} a
                  las {s.hora?.slice(0, 5)}
                  {!s.activa && " — pausada"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {vista === "calendario" && (
        <div className="card">
          <CalendarioEntregables
            entregables={entregables}
            reuniones={reuniones}
            editable={puedeAdministrar}
            onReprogramar={reprogramarEntregable}
            onEntregableClick={(e) => setModalEntregable(e)}
            onReunionClick={(r) => setModalReunion(r)}
          />
        </div>
      )}

      {vista === "tabla" && (
      <div className="card">
        <div className="table-responsive">
        <table className="table">
          <thead>
            <tr>
              <th>Entregable</th>
              <th>Fecha entrega</th>
              <th>Avance</th>
              <th>Estatus</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {entregables.map((e) => (
              <tr key={e.id}>
                <td>
                  {e.nombre}
                  {e.sensible && <span className="badge badge--sensible" style={{ marginLeft: 8 }}>Sensible</span>}
                </td>
                <td>{e.fecha_entrega}</td>
                <td style={{ minWidth: 160 }}>
                  {editandoId === e.id ? (
                    <div className="stack" style={{ gap: 4 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input
                          className="input"
                          type="number"
                          min={0}
                          max={100}
                          value={valorEdicion}
                          onChange={(ev) => setValorEdicion(ev.target.value)}
                          style={{ width: 70 }}
                        />
                        <button className="btn btn--primary" onClick={() => guardarAvance(e.id)}>
                          Guardar
                        </button>
                      </div>
                      {errorAvance && <span className="error-text">{errorAvance}</span>}
                    </div>
                  ) : (
                    <div
                      style={{ cursor: "pointer" }}
                      onClick={() => {
                        setEditandoId(e.id);
                        setValorEdicion(e.porcentaje_avance);
                        setErrorAvance("");
                      }}
                      title="Clic para actualizar avance"
                    >
                      <div className="progress-bar">
                        <div
                          className="progress-bar__fill"
                          style={{ width: `${e.porcentaje_avance}%` }}
                        />
                      </div>
                      <span style={{ fontSize: "0.78rem", color: "var(--color-text-muted)" }}>
                        {e.porcentaje_avance}%
                      </span>
                    </div>
                  )}
                </td>
                <td>
                  <EstatusBadge estatus={e.estatus} />
                </td>
                <td>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn btn--ghost" onClick={() => setEntregableHistorial(e)}>
                      Ver histórico
                    </button>
                    {puedeAdministrar && (
                      <button className="btn btn--ghost" onClick={() => setModalEntregable(e)}>
                        Editar
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {entregables.length === 0 && (
              <tr>
                <td colSpan={5} style={{ color: "var(--color-text-muted)" }}>
                  No hay entregables visibles para ti en este tema todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
      )}

      {vista === "kanban" && (
        <div className="card">
          <KanbanEntregables
            entregables={entregables}
            equipo={equipo}
            onMoverEstatus={moverEstatusKanban}
            onEntregableClick={(e) => setModalEntregable(e)}
            error={errorAvance}
          />
        </div>
      )}

      {modalEntregable && (
        <FormularioEntregable
          proyectoId={proyectoId}
          entregable={modalEntregable === "nuevo" ? null : modalEntregable}
          miembros={equipo}
          puedeAsignarAOtros={puedeAdministrar}
          usuarioActualId={usuario?.id}
          onGuardado={async () => {
            setModalEntregable(null);
            await cargarTodo();
          }}
          onCerrar={() => setModalEntregable(null)}
        />
      )}

      {mostrarModalEquipo && (
        <ModalEquipo
          proyectoId={proyectoId}
          miembros={equipo}
          entregables={entregables}
          reuniones={reuniones}
          viewerRolEfectivo={proyecto?.rol_efectivo}
          onCambio={cargarTodo}
          onCerrar={() => setMostrarModalEquipo(false)}
        />
      )}

      {modalSubtema && (
        <ModalEditarProyecto
          parentId={Number(proyectoId)}
          onGuardado={async () => {
            setModalSubtema(false);
            await cargarTodo();
          }}
          onCerrar={() => setModalSubtema(false)}
        />
      )}

      {modalEditarTema && (
        <ModalEditarProyecto
          proyecto={proyecto}
          onGuardado={async () => {
            setModalEditarTema(false);
            await cargarTodo();
          }}
          onCerrar={() => setModalEditarTema(false)}
        />
      )}

      {confirmandoEliminarTema && (
        <ConfirmDialog
          titulo="Eliminar tema"
          mensaje={
            resumenEliminarTema && resumenEliminarTema.total_subtemas > 0
              ? `¿Eliminar "${proyecto?.nombre}"? Esto también borra ${resumenEliminarTema.total_subtemas} subtema(s), ${resumenEliminarTema.total_entregables} entregable(s) y ${resumenEliminarTema.total_reuniones} reunión(es) de todo su subárbol. Esta acción no se puede deshacer.`
              : `¿Eliminar el tema "${proyecto?.nombre}"? Esto borra también su equipo, entregables y reuniones. Esta acción no se puede deshacer.`
          }
          textoConfirmar={eliminandoTema ? "Eliminando..." : "Eliminar"}
          onConfirmar={confirmarEliminarTema}
          onCancelar={() => setConfirmandoEliminarTema(false)}
        />
      )}

      {entregableHistorial && (
        <ModalHistorial
          entregable={entregableHistorial}
          miembros={equipo}
          onCerrar={() => setEntregableHistorial(null)}
        />
      )}

      {modalReunion && (
        <ModalReunion
          proyectoId={proyectoId}
          reunion={modalReunion === "nueva" ? null : modalReunion}
          miembros={equipo}
          organizadorId={modalReunion === "nueva" ? usuario?.id : modalReunion.organizador_id}
          puedeAdministrar={puedeAdministrar}
          onGuardado={async () => {
            setModalReunion(null);
            await cargarTodo();
          }}
          onCerrar={() => setModalReunion(null)}
        />
      )}

      {modalSerie && (
        <ModalSerieReunion
          proyectoId={Number(proyectoId)}
          serie={modalSerie === "nueva" ? null : modalSerie}
          miembros={equipo}
          onGuardado={cargarTodo}
          onCerrar={() => setModalSerie(null)}
        />
      )}

      {reunionMinuta && (
        <ModalMinuta
          reunion={reunionMinuta}
          miembros={equipo}
          puedeAdministrar={puedeAdministrar}
          onCerrar={async () => {
            setReunionMinuta(null);
            await cargarTodo();
          }}
        />
      )}
    </div>
  );
}

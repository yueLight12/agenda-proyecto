import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { entregablesApi, proyectosApi, reunionesApi } from "../api/endpoints";
import EstatusBadge from "../components/EstatusBadge";
import CalendarioEntregables from "../components/CalendarioEntregables";
import KanbanEntregables from "../components/KanbanEntregables";
import FormularioEntregable from "../components/FormularioEntregable";
import ModalEquipo from "../components/ModalEquipo";
import ModalHistorial from "../components/ModalHistorial";
import ModalReunion from "../components/ModalReunion";
import ModalMinuta from "../components/ModalMinuta";
import { useAuth } from "../context/AuthContext";

export default function TableroProyecto() {
  const { proyectoId } = useParams();
  const { usuario } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [proyecto, setProyecto] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [entregables, setEntregables] = useState([]);
  const [reuniones, setReuniones] = useState([]);
  const [equipo, setEquipo] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [editandoId, setEditandoId] = useState(null);
  const [valorEdicion, setValorEdicion] = useState(0);
  const [modalEntregable, setModalEntregable] = useState(null); // null | "nuevo" | entregable a editar
  const [modalReunion, setModalReunion] = useState(null); // null | "nueva" | reunion a editar
  const [mostrarModalEquipo, setMostrarModalEquipo] = useState(false);
  const [reunionMinuta, setReunionMinuta] = useState(null);
  const [entregableHistorial, setEntregableHistorial] = useState(null);
  const [error, setError] = useState("");
  const [errorAvance, setErrorAvance] = useState("");
  const [vista, setVista] = useState("tabla"); // "tabla" | "calendario" | "kanban"

  const rolEnProyecto = usuario?.es_super_admin
    ? "N1"
    : usuario?.roles_por_proyecto.find((r) => r.proyecto_id === Number(proyectoId))?.rol;
  const puedeAdministrar = rolEnProyecto === "N1" || rolEnProyecto === "N2";

  const cargarTodo = async () => {
    const [p, r, e, eq, reu] = await Promise.all([
      proyectosApi.obtener(proyectoId),
      proyectosApi.resumen(proyectoId),
      entregablesApi.listarPorProyecto(proyectoId),
      proyectosApi.equipo(proyectoId),
      reunionesApi.listarPorProyecto(proyectoId),
    ]);
    setProyecto(p);
    setResumen(r);
    setEntregables(e);
    setEquipo(eq);
    setReuniones(reu);
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
      .catch(() => setError("No se pudo cargar el proyecto. Intenta de nuevo más tarde."))
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

  if (cargando) return <p>Cargando proyecto...</p>;
  if (error) return <p className="error-text">{error}</p>;

  return (
    <div className="stack">
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
            <button
              className={vista === "calendario" ? "btn btn--primary" : "btn btn--ghost"}
              onClick={() => setVista("calendario")}
            >
              Calendario
            </button>
            <button
              className={vista === "kanban" ? "btn btn--primary" : "btn btn--ghost"}
              onClick={() => setVista("kanban")}
            >
              Kanban
            </button>
          </div>
          {puedeAdministrar && (
            <button className="btn btn--ghost" onClick={() => setMostrarModalEquipo(true)}>
              Administrar equipo
            </button>
          )}
          <button className="btn btn--primary" onClick={() => setModalEntregable("nuevo")}>
            {puedeAdministrar ? "Nuevo entregable" : "Agregarme una tarea"}
          </button>
          <button className="btn btn--ghost" onClick={() => setModalReunion("nueva")}>
            Nueva reunión
          </button>
        </div>
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
            No tienes reuniones agendadas en este proyecto.
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
                  No hay entregables visibles para ti en este proyecto todavía.
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
          onCambio={cargarTodo}
          onCerrar={() => setMostrarModalEquipo(false)}
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

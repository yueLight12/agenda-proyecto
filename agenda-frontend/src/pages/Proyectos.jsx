import { useEffect, useState } from "react";
import { proyectosApi } from "../api/endpoints";
import ConfirmDialog from "../components/ConfirmDialog";
import KanbanMisProyectos from "../components/KanbanMisProyectos";
import ModalEditarProyecto from "../components/ModalEditarProyecto";
import ModalEquipo from "../components/ModalEquipo";

export default function Proyectos() {
  const [proyectos, setProyectos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const [modalProyecto, setModalProyecto] = useState(null); // null | "nuevo" | proyecto a editar
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(null); // proyecto a eliminar, o null
  const [resumenEliminar, setResumenEliminar] = useState(null);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState("");
  // Tema recién creado + su equipo inicial (el creador, y quien lo haya
  // heredado como dirección/líder por la plantilla "Mi equipo") -- se abre
  // solo para ofrecer agregar más gente ahora mismo, sin obligar a nada
  // (Yue, 2026-08-17: "poder asignar al equipo al crear, o dejarlo para
  // después"). Cerrar este modal sin hacer nada es una opción válida.
  const [temaRecienCreado, setTemaRecienCreado] = useState(null);
  const [equipoTemaRecienCreado, setEquipoTemaRecienCreado] = useState([]);

  const cargarProyectos = () =>
    proyectosApi
      .listar()
      .then(setProyectos)
      .catch(() => setError("No se pudieron cargar tus temas. Intenta de nuevo más tarde."))
      .finally(() => setCargando(false));

  useEffect(() => {
    cargarProyectos();
  }, []);

  // Editar y eliminar proyecto se calculan en servidor (proyecto.puede_administrar,
  // ver ProyectoOut) -- N1 o N2, local o heredado (decisión explícita de
  // Yue, 2026-08-16: un líder puede administrar por completo los proyectos
  // que lidera, aunque no los haya creado él). Nunca recalcular aquí
  // cruzando usuario.roles_por_proyecto.
  const abrirConfirmarEliminar = async (proyecto) => {
    setErrorEliminar("");
    setResumenEliminar(proyecto.tiene_hijos ? await proyectosApi.resumenSubarbol(proyecto.id) : null);
    setConfirmandoEliminar(proyecto);
  };

  const abrirEquipoDeTemaRecienCreado = async (nuevo) => {
    setModalProyecto(null);
    await cargarProyectos();
    const equipo = await proyectosApi.equipo(nuevo.id);
    setEquipoTemaRecienCreado(equipo);
    setTemaRecienCreado(nuevo);
  };

  const confirmarEliminar = async () => {
    setEliminando(true);
    setErrorEliminar("");
    try {
      await proyectosApi.eliminar(confirmandoEliminar.id);
      setConfirmandoEliminar(null);
      await cargarProyectos();
    } catch (err) {
      setErrorEliminar(err.response?.data?.detail || "No se pudo eliminar el tema.");
    } finally {
      setEliminando(false);
    }
  };

  if (cargando) return <p>Cargando temas...</p>;
  if (error) return <p className="error-text">{error}</p>;

  return (
    <div className="stack">
      <div className="list-inline">
        <h1>Tus temas</h1>
        <button className="btn btn--primary" onClick={() => setModalProyecto("nuevo")}>
          Crear tema
        </button>
      </div>

      {errorEliminar && <p className="error-text">{errorEliminar}</p>}

      {proyectos.length === 0 && (
        <p style={{ color: "var(--color-text-muted)" }}>
          Todavía no tienes temas — usa "Crear tema" arriba para empezar.
        </p>
      )}
      <KanbanMisProyectos
        proyectos={proyectos}
        onEditar={setModalProyecto}
        onEliminar={abrirConfirmarEliminar}
      />

      {modalProyecto && (
        <ModalEditarProyecto
          proyecto={modalProyecto === "nuevo" ? null : modalProyecto}
          onCreado={abrirEquipoDeTemaRecienCreado}
          onGuardado={async () => {
            setModalProyecto(null);
            await cargarProyectos();
          }}
          onCerrar={() => setModalProyecto(null)}
        />
      )}

      {temaRecienCreado && (
        <ModalEquipo
          proyectoId={temaRecienCreado.id}
          miembros={equipoTemaRecienCreado}
          titulo={`"${temaRecienCreado.nombre}" creado — agrega a tu equipo (opcional)`}
          onCambio={async () => {
            setEquipoTemaRecienCreado(await proyectosApi.equipo(temaRecienCreado.id));
            await cargarProyectos();
          }}
          onCerrar={() => setTemaRecienCreado(null)}
        />
      )}

      {confirmandoEliminar && (
        <ConfirmDialog
          titulo="Eliminar tema"
          mensaje={
            resumenEliminar && resumenEliminar.total_subtemas > 0
              ? `¿Eliminar "${confirmandoEliminar.nombre}"? Esto también borra ${resumenEliminar.total_subtemas} subtema(s), ${resumenEliminar.total_entregables} entregable(s) y ${resumenEliminar.total_reuniones} reunión(es) de todo su subárbol. Esta acción no se puede deshacer.`
              : `¿Eliminar el tema "${confirmandoEliminar.nombre}"? Esto borra también su equipo, entregables y reuniones. Esta acción no se puede deshacer.`
          }
          textoConfirmar={eliminando ? "Eliminando..." : "Eliminar"}
          onConfirmar={confirmarEliminar}
          onCancelar={() => setConfirmandoEliminar(null)}
        />
      )}
    </div>
  );
}

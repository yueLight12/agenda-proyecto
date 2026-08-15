import { useEffect, useState } from "react";
import { proyectosApi } from "../api/endpoints";
import { useAuth } from "../context/AuthContext";
import ConfirmDialog from "../components/ConfirmDialog";
import KanbanMisProyectos from "../components/KanbanMisProyectos";
import ModalEditarProyecto from "../components/ModalEditarProyecto";

export default function Proyectos() {
  const { usuario } = useAuth();
  const [proyectos, setProyectos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const [modalProyecto, setModalProyecto] = useState(null); // null | "nuevo" | proyecto a editar
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(null); // proyecto a eliminar, o null
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState("");

  const cargarProyectos = () =>
    proyectosApi
      .listar()
      .then(setProyectos)
      .catch(() => setError("No se pudieron cargar tus proyectos. Intenta de nuevo más tarde."))
      .finally(() => setCargando(false));

  useEffect(() => {
    cargarProyectos();
  }, []);

  const esN1DelProyecto = (proyectoId) => {
    if (usuario?.es_super_admin) return true;
    return usuario?.roles_por_proyecto.some(
      (r) => r.proyecto_id === proyectoId && r.rol === "N1"
    );
  };

  const rolDelViewer = (proyectoId) =>
    usuario?.es_super_admin
      ? "N1"
      : usuario?.roles_por_proyecto.find((r) => r.proyecto_id === proyectoId)?.rol;

  const confirmarEliminar = async () => {
    setEliminando(true);
    setErrorEliminar("");
    try {
      await proyectosApi.eliminar(confirmandoEliminar.id);
      setConfirmandoEliminar(null);
      await cargarProyectos();
    } catch (err) {
      setErrorEliminar(err.response?.data?.detail || "No se pudo eliminar el proyecto.");
    } finally {
      setEliminando(false);
    }
  };

  if (cargando) return <p>Cargando proyectos...</p>;
  if (error) return <p className="error-text">{error}</p>;

  return (
    <div className="stack">
      <div className="list-inline">
        <h1>Tus proyectos</h1>
        <button className="btn btn--primary" onClick={() => setModalProyecto("nuevo")}>
          Crear proyecto
        </button>
      </div>

      {errorEliminar && <p className="error-text">{errorEliminar}</p>}

      {proyectos.length === 0 && (
        <p style={{ color: "var(--color-text-muted)" }}>
          Todavía no tienes proyectos — usa "Crear proyecto" arriba para empezar.
        </p>
      )}
      <KanbanMisProyectos
        proyectos={proyectos}
        rolDeProyecto={rolDelViewer}
        esN1DelProyecto={esN1DelProyecto}
        onEditar={setModalProyecto}
        onEliminar={setConfirmandoEliminar}
      />

      {modalProyecto && (
        <ModalEditarProyecto
          proyecto={modalProyecto === "nuevo" ? null : modalProyecto}
          onGuardado={async () => {
            setModalProyecto(null);
            await cargarProyectos();
          }}
          onCerrar={() => setModalProyecto(null)}
        />
      )}

      {confirmandoEliminar && (
        <ConfirmDialog
          titulo="Eliminar proyecto"
          mensaje={`¿Eliminar el proyecto "${confirmandoEliminar.nombre}"? Esto borra también su equipo, entregables y reuniones. Esta acción no se puede deshacer.`}
          textoConfirmar={eliminando ? "Eliminando..." : "Eliminar"}
          onConfirmar={confirmarEliminar}
          onCancelar={() => setConfirmandoEliminar(null)}
        />
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { equipoResumenApi, proyectosApi } from "../api/endpoints";
import { useAuth } from "../context/AuthContext";
import ConfirmDialog from "./ConfirmDialog";
import KanbanSupervisores from "./KanbanSupervisores";
import ModalEditarProyecto from "./ModalEditarProyecto";
import ModalEquipo from "./ModalEquipo";

export default function ResumenEquipo() {
  const { usuario } = useAuth();
  const [miembros, setMiembros] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [modalProyecto, setModalProyecto] = useState(null); // { id, nombre, rol_efectivo } | null
  const [miembrosModal, setMiembrosModal] = useState([]);
  const [creandoTema, setCreandoTema] = useState(false);
  const [editandoTema, setEditandoTema] = useState(null); // proyecto completo (GET /proyectos/{id}) | null
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(null); // { id, nombre } | null
  const [resumenEliminar, setResumenEliminar] = useState(null);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState("");

  const cargar = () =>
    equipoResumenApi
      .resumen()
      .then((data) => setMiembros(data.miembros))
      .catch(() => setError("No se pudo cargar el resumen de tu equipo. Intenta de nuevo más tarde."))
      .finally(() => setCargando(false));

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const abrirAdministrar = async (proyectoId, proyectoNombre) => {
    const [equipo, proyecto] = await Promise.all([
      proyectosApi.equipo(proyectoId),
      proyectosApi.obtener(proyectoId),
    ]);
    setMiembrosModal(equipo);
    setModalProyecto({ id: proyectoId, nombre: proyectoNombre, rol_efectivo: proyecto.rol_efectivo });
  };

  const refrescarModal = async () => {
    const fresco = await proyectosApi.equipo(modalProyecto.id);
    setMiembrosModal(fresco);
    await cargar();
  };

  // Editar/eliminar tema (2026-08-17, movido aquí al fusionar "Temas" con
  // "Equipo") -- mismo patrón que antes vivía en Proyectos.jsx. Se
  // gatilla desde el botón por proyecto en KanbanSupervisores, gated
  // server-side por viewer_puede_administrar.
  const abrirEditarTema = async (proyectoId) => {
    setErrorEliminar("");
    const proyecto = await proyectosApi.obtener(proyectoId);
    setEditandoTema(proyecto);
  };

  const abrirEliminarTema = async (proyectoId, proyectoNombre) => {
    setErrorEliminar("");
    const proyecto = await proyectosApi.obtener(proyectoId);
    setResumenEliminar(proyecto.tiene_hijos ? await proyectosApi.resumenSubarbol(proyectoId) : null);
    setConfirmandoEliminar({ id: proyectoId, nombre: proyectoNombre });
  };

  const confirmarEliminarTema = async () => {
    setEliminando(true);
    setErrorEliminar("");
    try {
      await proyectosApi.eliminar(confirmandoEliminar.id);
      setConfirmandoEliminar(null);
      await cargar();
    } catch (err) {
      setErrorEliminar(err.response?.data?.detail || "No se pudo eliminar el tema.");
    } finally {
      setEliminando(false);
    }
  };

  if (cargando) return <p>Cargando resumen de tu equipo...</p>;
  if (error) return <p className="error-text">{error}</p>;

  return (
    <div className="stack">
      <div className="list-inline" style={{ borderBottom: "none", padding: 0, justifyContent: "flex-end" }}>
        <button className="btn btn--primary" type="button" onClick={() => setCreandoTema(true)}>
          Crear tema
        </button>
      </div>

      {errorEliminar && <p className="error-text">{errorEliminar}</p>}

      <KanbanSupervisores
        miembros={miembros}
        onAdministrar={abrirAdministrar}
        onEditarTema={abrirEditarTema}
        onEliminarTema={abrirEliminarTema}
        usuarioActualId={usuario?.id}
      />

      {modalProyecto && (
        <ModalEquipo
          proyectoId={modalProyecto.id}
          miembros={miembrosModal}
          viewerRolEfectivo={modalProyecto.rol_efectivo}
          onCambio={refrescarModal}
          onCerrar={() => setModalProyecto(null)}
        />
      )}

      {creandoTema && (
        <ModalEditarProyecto
          proyecto={null}
          onGuardado={async () => {
            setCreandoTema(false);
            await cargar();
          }}
          onCerrar={() => setCreandoTema(false)}
        />
      )}

      {editandoTema && (
        <ModalEditarProyecto
          proyecto={editandoTema}
          onGuardado={async () => {
            setEditandoTema(null);
            await cargar();
          }}
          onCerrar={() => setEditandoTema(null)}
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
          onConfirmar={confirmarEliminarTema}
          onCancelar={() => setConfirmandoEliminar(null)}
        />
      )}
    </div>
  );
}

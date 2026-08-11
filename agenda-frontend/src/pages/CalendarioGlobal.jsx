import { useEffect, useState } from "react";
import CalendarioEntregables from "../components/CalendarioEntregables";
import ModalHistorial from "../components/ModalHistorial";
import ModalReunion from "../components/ModalReunion";
import { entregablesApi, proyectosApi, reunionesApi } from "../api/endpoints";
import { useAuth } from "../context/AuthContext";

export default function CalendarioGlobal() {
  const { usuario } = useAuth();
  const [entregables, setEntregables] = useState([]);
  const [reuniones, setReuniones] = useState([]);
  const [equiposPorProyecto, setEquiposPorProyecto] = useState({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [entregableHistorial, setEntregableHistorial] = useState(null);
  const [modalReunion, setModalReunion] = useState(null);

  const cargarTodo = async () => {
    const proyectos = await proyectosApi.listar();
    const listasEntregables = await Promise.all(
      proyectos.map((p) =>
        entregablesApi
          .listarPorProyecto(p.id)
          .then((es) => es.map((e) => ({ ...e, proyecto_nombre: p.nombre, proyecto_id: p.id })))
      )
    );
    const listasReuniones = await Promise.all(
      proyectos.map((p) =>
        reunionesApi
          .listarPorProyecto(p.id)
          .then((rs) => rs.map((r) => ({ ...r, proyecto_nombre: p.nombre })))
      )
    );
    const equipos = await Promise.all(proyectos.map((p) => proyectosApi.equipo(p.id)));
    const mapaEquipos = {};
    proyectos.forEach((p, i) => {
      mapaEquipos[p.id] = equipos[i];
    });
    setEntregables(listasEntregables.flat());
    setReuniones(listasReuniones.flat());
    setEquiposPorProyecto(mapaEquipos);
  };

  useEffect(() => {
    setCargando(true);
    setError("");
    cargarTodo()
      .catch(() => setError("No se pudo cargar el calendario. Intenta de nuevo más tarde."))
      .finally(() => setCargando(false));
  }, []);

  const puedeEditar = (entregable) => {
    if (usuario?.es_super_admin) return true;
    const rol = usuario?.roles_por_proyecto.find(
      (r) => r.proyecto_id === entregable.proyecto_id
    )?.rol;
    return rol === "N1" || rol === "N2";
  };

  const reprogramarEntregable = async (entregable, nuevaFecha) => {
    await entregablesApi.actualizar(entregable.id, { fecha_entrega: nuevaFecha });
    await cargarTodo();
  };

  if (cargando) return <p>Cargando calendario...</p>;
  if (error) return <p className="error-text">{error}</p>;

  return (
    <div className="stack">
      <h1>Calendario</h1>
      {entregables.length === 0 && reuniones.length === 0 && (
        <p style={{ color: "var(--color-text-muted)" }}>
          No hay entregables ni reuniones visibles para ti todavía.
        </p>
      )}
      <div className="card">
        <CalendarioEntregables
          entregables={entregables}
          reuniones={reuniones}
          editable
          puedeEditar={puedeEditar}
          onReprogramar={reprogramarEntregable}
          onEntregableClick={(e) => setEntregableHistorial(e)}
          onReunionClick={(r) => setModalReunion(r)}
        />
      </div>

      {entregableHistorial && (
        <ModalHistorial
          entregable={entregableHistorial}
          miembros={[]}
          onCerrar={() => setEntregableHistorial(null)}
        />
      )}

      {modalReunion && (
        <ModalReunion
          proyectoId={modalReunion.proyecto_id}
          reunion={modalReunion}
          miembros={equiposPorProyecto[modalReunion.proyecto_id] || []}
          organizadorId={modalReunion.organizador_id}
          puedeAdministrar={puedeEditar({ proyecto_id: modalReunion.proyecto_id })}
          onGuardado={async () => {
            setModalReunion(null);
            await cargarTodo();
          }}
          onCerrar={() => setModalReunion(null)}
        />
      )}
    </div>
  );
}

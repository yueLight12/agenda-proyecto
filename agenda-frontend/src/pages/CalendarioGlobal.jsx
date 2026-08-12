import { useEffect, useState } from "react";
import CalendarioEntregables from "../components/CalendarioEntregables";
import ModalHistorial from "../components/ModalHistorial";
import ModalReunion from "../components/ModalReunion";
import { entregablesApi, eventosEmpresaApi, proyectosApi, reunionesApi } from "../api/endpoints";
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
  const [modo, setModo] = useState("general"); // "personal" | "general" | "empresa"
  const [eventosEmpresa, setEventosEmpresa] = useState([]);

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
    const eventos = await eventosEmpresaApi.listar();
    setEntregables(listasEntregables.flat());
    setReuniones(listasReuniones.flat());
    setEquiposPorProyecto(mapaEquipos);
    setEventosEmpresa(eventos);
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

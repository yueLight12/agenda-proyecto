import { useEffect, useState } from "react";
import CalendarioEntregables from "../components/CalendarioEntregables";
import FormularioEntregable from "../components/FormularioEntregable";
import ModalEventoEmpresa from "../components/ModalEventoEmpresa";
import ModalReunion from "../components/ModalReunion";
import {
  entregablesApi,
  eventosEmpresaApi,
  proyectosApi,
  reunionesApi,
} from "../api/endpoints";
import { useAuth } from "../context/AuthContext";

export default function CalendarioGlobal({ altoCalendario } = {}) {
  const { usuario } = useAuth();
  const [entregables, setEntregables] = useState([]);
  const [reuniones, setReuniones] = useState([]);
  const [equiposPorProyecto, setEquiposPorProyecto] = useState({});
  const [invitablesPorProyecto, setInvitablesPorProyecto] = useState({});
  const [invitablesGenerales, setInvitablesGenerales] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [modalEntregable, setModalEntregable] = useState(null);
  const [modalReunion, setModalReunion] = useState(null);
  const [modalEventoEmpresa, setModalEventoEmpresa] = useState(null);
  const [modo, setModo] = useState("general"); // "personal" | "general" | "empresa"
  const [eventosEmpresa, setEventosEmpresa] = useState([]);

  const cargarTodo = async () => {
    const raices = await proyectosApi.listar();
    // Cada raíz trae, en cascada, los entregables/reuniones de todo su
    // subárbol de subtemas (query generalizada en el backend, ver Fase 1 de
    // jerarquía 2026-08-16) -- pero cada ítem trae su proyecto_id REAL (el
    // del subtema exacto, no el de la raíz), así que el nombre y el equipo
    // se resuelven por ese id propio, no por el de la raíz que disparó el fetch.
    const listasEntregables = await Promise.all(
      raices.map((p) => entregablesApi.listarPorProyecto(p.id))
    );
    const listasReuniones = await Promise.all(
      raices.map((p) => reunionesApi.listarPorProyecto(p.id))
    );
    const reunionesGenerales = await reunionesApi.listarGenerales();
    const todosEntregables = listasEntregables.flat();
    const todosReuniones = [...listasReuniones.flat(), ...reunionesGenerales];

    const idsProyectos = new Set([
      ...raices.map((p) => p.id),
      ...todosEntregables.map((e) => e.proyecto_id),
      ...todosReuniones.filter((r) => r.proyecto_id).map((r) => r.proyecto_id),
    ]);
    const nombresPorId = {};
    raices.forEach((p) => {
      nombresPorId[p.id] = p.nombre;
    });
    // Para subtemas (proyecto_id distinto de cualquier raíz) hace falta
    // pedir el nombre propio del nodo -- no viene en la lista de raíces.
    await Promise.all(
      [...idsProyectos]
        .filter((id) => !(id in nombresPorId))
        .map((id) => proyectosApi.obtener(id).then((p) => (nombresPorId[id] = p.nombre)))
    );

    const equiposEntries = await Promise.all(
      [...idsProyectos].map((id) => proyectosApi.equipo(id).then((eq) => [id, eq]))
    );
    const mapaEquipos = Object.fromEntries(equiposEntries);
    // A quién se puede invitar a una reunión/junta -- más permisiva que el
    // equipo del tema (incluye jefe/Dirección, ver
    // services/reuniones.py::listar_invitables_reunion). No reemplaza
    // equiposPorProyecto, que se sigue usando para lo demás (entregables).
    const invitablesEntries = await Promise.all(
      [...idsProyectos].map((id) => reunionesApi.invitables(id).then((inv) => [id, inv]))
    );
    const mapaInvitables = Object.fromEntries(invitablesEntries);

    const eventos = await eventosEmpresaApi.listar();
    const invitablesGeneral = await reunionesApi.invitables();
    setInvitablesGenerales(invitablesGeneral);
    setInvitablesPorProyecto(mapaInvitables);
    setEntregables(
      todosEntregables.map((e) => ({ ...e, proyecto_nombre: nombresPorId[e.proyecto_id] }))
    );
    setReuniones(
      todosReuniones.map((r) => ({
        ...r,
        proyecto_nombre: r.proyecto_id ? nombresPorId[r.proyecto_id] : "General",
      }))
    );
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

  // Calculado en servidor (entregable.puede_editar / reunion.puede_editar) --
  // nunca cruzar usuario.roles_por_proyecto aquí, se rompe con herencia de
  // subtemas (ver Fase 1 de jerarquía, 2026-08-16).
  const puedeEditar = (item) => Boolean(item.puede_editar);

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
        <button className="btn btn--ghost" onClick={() => setModalReunion("nueva-general")}>
          Nueva reunión general
        </button>
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
          onEntregableClick={(e) => setModalEntregable(e)}
          onReunionClick={(r) => setModalReunion(r)}
          onEventoEmpresaClick={(ev) => setModalEventoEmpresa(ev)}
          {...(altoCalendario ? { alto: altoCalendario } : {})}
        />
      </div>

      {modalEntregable && (
        <FormularioEntregable
          proyectoId={modalEntregable.proyecto_id}
          entregable={modalEntregable}
          miembros={equiposPorProyecto[modalEntregable.proyecto_id] || []}
          puedeAsignarAOtros={puedeEditar(modalEntregable)}
          usuarioActualId={usuario?.id}
          onGuardado={async () => {
            setModalEntregable(null);
            await cargarTodo();
          }}
          onCerrar={() => setModalEntregable(null)}
        />
      )}

      {modalEventoEmpresa && (
        <ModalEventoEmpresa evento={modalEventoEmpresa} onCerrar={() => setModalEventoEmpresa(null)} />
      )}

      {modalReunion && modalReunion !== "nueva-general" && (
        <ModalReunion
          proyectoId={modalReunion.proyecto_id}
          reunion={modalReunion}
          miembros={
            modalReunion.proyecto_id
              ? invitablesPorProyecto[modalReunion.proyecto_id] || []
              : invitablesGenerales
          }
          organizadorId={modalReunion.organizador_id}
          puedeAdministrar={puedeEditar(modalReunion)}
          onGuardado={cargarTodo}
          onCerrar={() => setModalReunion(null)}
        />
      )}

      {modalReunion === "nueva-general" && (
        <ModalReunion
          proyectoId={null}
          reunion={null}
          miembros={invitablesGenerales}
          organizadorId={usuario?.id}
          puedeAdministrar
          onGuardado={cargarTodo}
          onCerrar={() => setModalReunion(null)}
        />
      )}
    </div>
  );
}

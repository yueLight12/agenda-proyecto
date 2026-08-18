import { useEffect, useState } from "react";
import { equipoResumenApi, minutasApi, notasApi, pendientesApi, proyectosApi } from "../api/endpoints";
import { useAuth } from "../context/AuthContext";
import { armarColumnasEquipo } from "../utils/equipoSupervisores";
import { semanaActual, textoRangoSemana } from "../utils/fechas";
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
  const [notasPorProyecto, setNotasPorProyecto] = useState({});
  const [pendientesPorProyecto, setPendientesPorProyecto] = useState({});
  const [misJefes, setMisJefes] = useState([]);
  const [pendientesRevision, setPendientesRevision] = useState({}); // proyecto_id -> {item_id, reunion_id}
  const [marcandoRevisado, setMarcandoRevisado] = useState(null); // proyecto_id en curso, o null
  const [errorRevision, setErrorRevision] = useState("");
  const [temasResueltos, setTemasResueltos] = useState(new Set());

  // Avisos (Nota) y Pendientes cuelgan de un proyecto/tema, no de una
  // persona -- las cajas "Avisos"/"Pendientes" de cada columna en Vista
  // Equipo muestran la unión de los temas de esa persona, así que se
  // cargan una vez por proyecto_id único VISIBLE EN LAS COLUMNAS (mismo
  // conjunto que arma armarColumnasEquipo para KanbanSupervisores, no la
  // lista cruda de `miembros`): esa lista cruda incluye, para alguien que
  // comparte un solo proyecto con el viewer (ej. Diana en "Agenda
  // Inteligente"), TODOS sus proyectos propios aunque no se rendericen en
  // ninguna columna (ver armarColumnasEquipo/agruparPorSupervisor) -- pedir
  // notas/pendientes de esos generaría 403 esperados sin necesidad
  // (ver requerir_participacion_en_proyecto en el backend). Cada llamada
  // igual se ignora individualmente si falla, por si acaso.
  const cargarNotasYPendientes = async (miembrosData) => {
    const columnas = armarColumnasEquipo(miembrosData, usuario?.id);
    const idsUnicos = [...new Set(columnas.flatMap((c) => c.proyectos.map((p) => p.proyecto_id)))];
    const resultados = await Promise.all(
      idsUnicos.map((id) =>
        Promise.all([
          notasApi.listar({ proyecto_id: id }).catch(() => []),
          pendientesApi.listar({ proyecto_id: id }).catch(() => []),
        ])
      )
    );
    const notasMap = {};
    const pendientesMap = {};
    idsUnicos.forEach((id, i) => {
      notasMap[id] = resultados[i][0];
      pendientesMap[id] = resultados[i][1];
    });
    setNotasPorProyecto(notasMap);
    setPendientesPorProyecto(pendientesMap);
  };

  const cargar = () =>
    equipoResumenApi
      .resumen()
      .then(async (data) => {
        setMiembros(data.miembros);
        await cargarNotasYPendientes(data.miembros);
      })
      .catch(() => setError("No se pudo cargar el resumen de tu equipo. Intenta de nuevo más tarde."))
      .finally(() => setCargando(false));

  const agregarNota = async (proyectoId, contenido) => {
    await notasApi.crear({ proyecto_id: proyectoId, contenido });
    await cargarNotasYPendientes(miembros);
  };

  const agregarPendiente = async (proyectoId, contenido) => {
    await pendientesApi.crear({ proyecto_id: proyectoId, contenido });
    await cargarNotasYPendientes(miembros);
  };

  const cargarPendientesRevision = () =>
    equipoResumenApi
      .pendientesRevision()
      .then((lista) => {
        const mapa = {};
        lista.forEach((p) => {
          mapa[p.proyecto_id] = p;
        });
        setPendientesRevision(mapa);
      })
      .catch(() => {});

  const cargarTemasResueltos = () =>
    equipoResumenApi
      .temasResueltos()
      .then((lista) => setTemasResueltos(new Set(lista)))
      .catch(() => {});

  // Marcar un tema como revisado directo desde el árbol de Vista Equipo,
  // sin tener que ir a buscar la reunión (2026-08-18, a petición de Yue) --
  // reutiliza el mismo endpoint que ya usa el checklist de una junta
  // puntual; el backend ya archiva la copia en TODAS las juntas donde el
  // tema esté agregado (estado global por tema), así que basta con la
  // reunión representativa que trae /equipo/pendientes-revision.
  const marcarTemaRevisado = async (proyectoId) => {
    const pendiente = pendientesRevision[proyectoId];
    if (!pendiente) return;
    setMarcandoRevisado(proyectoId);
    setErrorRevision("");
    try {
      await minutasApi.registrarRevisionAgendaItem(pendiente.reunion_id, pendiente.item_id, {
        estado: "revisado",
      });
      await Promise.all([cargarPendientesRevision(), cargarTemasResueltos()]);
    } catch (err) {
      setErrorRevision(err.response?.data?.detail || "No se pudo marcar el tema como revisado.");
    } finally {
      setMarcandoRevisado(null);
    }
  };

  useEffect(() => {
    cargar();
    // Identidad pura de "quién es mi jefe" (2026-08-18, a petición de Yue:
    // "se tiene que ver el jefe siempre") -- solo lectura, sin checklist ni
    // botón asociado (eso se quitó por completo). Si falla, Vista Equipo
    // sigue funcionando sin esta línea, no bloquea el resto.
    equipoResumenApi
      .misJefes()
      .then(setMisJefes)
      .catch(() => {});
    cargarPendientesRevision();
    cargarTemasResueltos();
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

  const semana = semanaActual();

  // Caja del jefe (o jefes, caso matricial) -- 2026-08-18, a petición de
  // Yue: "se tiene que ver la caja, el kanban con todos los temas, así
  // como antes, la única diferencia es que no aparece el botón de
  // checklist". Reusa mi propia entrada de /equipo/resumen (ya trae mis
  // proyectos con entregables/reuniones/permisos calculados) filtrada a
  // los proyecto_ids de cada jefe (ver /equipo/mis-jefes) -- no pide datos
  // nuevos ni otorga visibilidad extra, solo re-etiqueta lo que ya veo
  // bajo la columna de quién me supervisa ahí.
  const miEntrada = miembros.find((m) => m.usuario_id === usuario?.id);
  const columnasJefes = misJefes.map((j) => ({
    usuario_id: j.id,
    nombre: j.nombre,
    proyectos: (miEntrada?.proyectos || []).filter((p) => j.proyecto_ids.includes(p.proyecto_id)),
  }));

  return (
    <div className="stack">
      <div
        className="list-inline"
        style={{ borderBottom: "none", padding: 0, justifyContent: "space-between", alignItems: "center" }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Minuta-Semana {semana.numero}</h2>
          <p style={{ margin: "2px 0 0", fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
            {textoRangoSemana(semana)}
          </p>
        </div>
        <button className="btn btn--primary" type="button" onClick={() => setCreandoTema(true)}>
          Crear tema
        </button>
      </div>

      {errorEliminar && <p className="error-text">{errorEliminar}</p>}
      {errorRevision && <p className="error-text">{errorRevision}</p>}

      <KanbanSupervisores
        miembros={miembros}
        onAdministrar={abrirAdministrar}
        onEditarTema={abrirEditarTema}
        onEliminarTema={abrirEliminarTema}
        usuarioActualId={usuario?.id}
        soloTemas
        notasPorProyecto={notasPorProyecto}
        pendientesPorProyecto={pendientesPorProyecto}
        onAgregarNota={agregarNota}
        onAgregarPendiente={agregarPendiente}
        columnasExtra={columnasJefes}
        pendientesRevision={pendientesRevision}
        onMarcarRevisado={marcarTemaRevisado}
        marcandoRevisado={marcandoRevisado}
        temasResueltos={temasResueltos}
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

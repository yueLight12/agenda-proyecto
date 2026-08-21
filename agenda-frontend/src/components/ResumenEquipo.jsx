import { useEffect, useState } from "react";
import { equipoResumenApi, minutasApi, notasApi, pendientesApi, proyectosApi, seriesReunionApi } from "../api/endpoints";
import { useAuth } from "../context/AuthContext";
import { armarColumnasEquipo } from "../utils/equipoSupervisores";
import { semanaActual, textoRangoSemana } from "../utils/fechas";
import ConfirmDialog from "./ConfirmDialog";
import KanbanSupervisores from "./KanbanSupervisores";
import ModalAsignarTareaRapida from "./ModalAsignarTareaRapida";
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
  // proyecto_id -> item_id del ítem archivado que lo dejó resuelto
  // (2026-08-18, a petición de Yue: "Marcar pendiente" explícito) -- lo que
  // necesita seriesReunionApi.revertirRevisado, mismo endpoint que ya usa
  // el botón "Revertir" de la pestaña Historial.
  const [itemPorTemaResuelto, setItemPorTemaResuelto] = useState({});
  const [marcandoPendiente, setMarcandoPendiente] = useState(null);
  const [moviendoTema, setMoviendoTema] = useState(null);
  const [errorOrden, setErrorOrden] = useState("");
  // Filtro del árbol de temas de Vista Equipo (2026-08-18, a petición de
  // Yue: "agregar filtros para que se filtren los temas por revisado,
  // pendiente", estilo Mercado Libre/Amazon: checkboxes independientes en
  // vez de botones excluyentes) -- default: solo "pendientes" marcado
  // (mismo comportamiento de siempre, oculta lo ya resuelto). Marcar
  // "revisados" también los suma a la vista sin quitar "pendientes";
  // desmarcar los dos no muestra nada, igual que un filtro real sin
  // ninguna casilla elegida.
  // Ambos activos por defecto (2026-08-19, fix de bug): si "revisados"
  // arranca desactivado, marcar un tema como revisado lo saca del filtro
  // visible y da la impresión de que "se eliminó" en vez de hundirse al
  // fondo de la tabla -- con los dos activos sí se ve el hundimiento.
  const [filtrosTemas, setFiltrosTemas] = useState(new Set(["pendientes", "revisados"]));
  // Buscador de personas (2026-08-19, a petición de Yue: "si solo quiero
  // ver los pendientes o temas de una sola persona no quiero tener que
  // navegar por toda la vista") -- filtra las COLUMNAS de KanbanSupervisores
  // por nombre, oculta el resto en vez de solo resaltar (elegido
  // explícitamente sobre "resaltar sin ocultar").
  const [busquedaPersona, setBusquedaPersona] = useState("");
  // Acceso rápido para asignar una tarea sin entrar a un tema específico
  // (2026-08-20, a petición de Yue: "una opción rápida de hacerlo") -- ver
  // ModalAsignarTareaRapida.jsx.
  const [asignandoTarea, setAsignandoTarea] = useState(false);
  // Navegación ◀/▶ entre semanas, embebida aquí mismo (2026-08-19, a
  // petición de Yue: "ya tenemos la plantilla de minuta aquí, ¿por qué no
  // agregamos botones de anterior/siguiente" en vez de la pestaña
  // Historial aparte, ya oculta). fechaRef = hoy desplazado `offsetSemanas`
  // semanas -- 0 es la semana actual (tabla en vivo, editable); cualquier
  // otro valor muestra el resumen de solo lectura de esa semana
  // (ContenidoHistorialSemana, mismo componente que ya usaba Historial).
  // "Siguiente" no pasa de la semana actual (no hay semanas futuras que
  // mostrar).
  const [offsetSemanas, setOffsetSemanas] = useState(0);
  const fechaRefSemana = (() => {
    const f = new Date();
    f.setDate(f.getDate() + offsetSemanas * 7);
    return f;
  })();
  const esSemanaActual = offsetSemanas === 0;
  const toggleFiltroTemas = (valor) => {
    setFiltrosTemas((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(valor)) siguiente.delete(valor);
      else siguiente.add(valor);
      return siguiente;
    });
  };

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
      .then((lista) => {
        setTemasResueltos(new Set(lista.map((t) => t.proyecto_id)));
        const mapa = {};
        lista.forEach((t) => {
          mapa[t.proyecto_id] = t.item_id;
        });
        setItemPorTemaResuelto(mapa);
      })
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

  // Contraparte explícita de "Marcar revisado" (2026-08-18, a petición de
  // Yue: "marcar explícitamente si un tema quedó revisado y otro
  // pendiente") -- mismo mecanismo que el botón "Revertir" de la pestaña
  // Historial (seriesReunionApi.revertirRevisado), solo que accesible
  // directo desde el menú "⋮" del árbol de temas.
  const marcarTemaPendiente = async (proyectoId) => {
    const itemId = itemPorTemaResuelto[proyectoId];
    if (!itemId) return;
    setMarcandoPendiente(proyectoId);
    setErrorRevision("");
    try {
      await seriesReunionApi.revertirRevisado(itemId);
      await Promise.all([cargarPendientesRevision(), cargarTemasResueltos()]);
    } catch (err) {
      setErrorRevision(err.response?.data?.detail || "No se pudo marcar el tema como pendiente.");
    } finally {
      setMarcandoPendiente(null);
    }
  };

  // Flechas ↑/↓ de orden de importancia (2026-08-18, a petición de Yue:
  // "ordenar los temas del más importante al menos importante") -- solo
  // recarga miembros (no notas/pendientes ni revisión), el orden vive en
  // el propio proyecto dentro de /equipo/resumen.
  const moverTema = async (proyectoId, direccion) => {
    setMoviendoTema(proyectoId);
    setErrorOrden("");
    try {
      await proyectosApi.reordenar(proyectoId, direccion);
      await cargar();
    } catch (err) {
      setErrorOrden(err.response?.data?.detail || "No se pudo reordenar el tema.");
    } finally {
      setMoviendoTema(null);
    }
  };

  // Alta rápida desde la fila "+ Agregar tema" al inicio de cada tabla de
  // persona (2026-08-19, a petición de Yue: crear el tema directo ahí,
  // Enter para confirmar, "se asigne como pendiente y se suba hasta arriba
  // con prioridad 1"). Prioridad 1: al_frente=true (ver
  // services/proyectos.py). "Pendiente": solo visual -- FilaTema ya
  // muestra el badge "Pendiente" para cualquier tema sin ítem de agenda
  // real todavía, sin necesidad de ligarlo a ninguna junta.
  // Si la columna es la propia del viewer (su "Yo"), no hace falta
  // asignación extra -- crear_proyecto ya lo deja como N1/dirección de su
  // propio tema nuevo. Si es la columna de otra persona, se le agrega como
  // colaboradora (N3) con el viewer como supervisor -- mismo default que
  // ya ofrece ModalEditarProyecto ("Dejar en blanco: quedarás tú como
  // supervisor").
  const crearTemaRapido = async (usuarioId, nombre) => {
    const nuevo = await proyectosApi.crear({ nombre, al_frente: true });
    if (usuarioId && usuarioId !== usuario?.id) {
      await proyectosApi.asignarRol(nuevo.id, {
        usuario_id: usuarioId,
        rol: "N3",
        supervisor_id: usuario?.id,
      });
    }
    await cargar();
  };

  // "+ Agregar subtema" dentro de cada tema (2026-08-19, a petición de
  // Yue: "así como agregamos tema podamos agregar subtemas", sin entrar al
  // tema) -- mismo al_frente=true (prioridad 1 entre sus hermanos). A
  // diferencia de crearTemaRapido, NO hace falta asignarRol aparte: un
  // subtema hereda la visibilidad de su padre para todo el equipo que ya
  // lo ve (ver _equipo_efectivo_por_herencia/incluir_heredado en el
  // backend, arreglado antes en esta misma sesión), así que aparece solo
  // bajo las mismas columnas que el tema padre.
  const crearSubtemaRapido = async (parentId, nombre) => {
    await proyectosApi.crear({ nombre, parent_id: parentId, al_frente: true });
    await cargar();
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

  const semana = semanaActual(fechaRefSemana);

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

  // Pestañas de semana tipo "selector de función de cine" (2026-08-19, a
  // petición de Yue, ver boceto de referencia con días Hoy/Mañana/...):
  // mismo lenguaje visual (franja con flechas en los extremos, pestaña
  // activa resaltada en azul), pero la unidad sigue siendo SEMANA, no día
  // -- "Minuta-Semana" agrupa pendientes por semana completa, no por fecha
  // suelta, así que cambiar la unidad habría sido un cambio de fondo, no
  // solo visual (confirmado con Yue antes de construir esto). Se muestran
  // las 4 semanas anteriores + la actual; "Siguiente" nunca pasa de la
  // actual (no hay semanas futuras que mostrar, mismo límite que ya
  // existía en el botón ▶ anterior).
  const pestanasSemana = [-4, -3, -2, -1, 0].map((offset) => {
    const f = new Date();
    f.setDate(f.getDate() + offset * 7);
    const s = semanaActual(f);
    return {
      offset,
      etiqueta: offset === 0 ? "Esta semana" : offset === -1 ? "Semana pasada" : `Semana ${s.numero}`,
      rango: textoRangoSemana(s),
    };
  });

  return (
    <div className="stack">
      <div>
        <p style={{ margin: "0 0 6px", fontSize: "0.85rem", color: "var(--color-text-muted)", textAlign: "center" }}>
          Minuta-Semana {semana.numero}
        </p>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            overflowX: "auto",
            paddingBottom: 4,
          }}
        >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            margin: "0 auto",
          }}
        >
          <button
            className="btn btn--ghost"
            type="button"
            onClick={() => setOffsetSemanas((o) => o - 1)}
            aria-label="Semana anterior"
            title="Semana anterior"
            style={{ flexShrink: 0 }}
          >
            ‹
          </button>
          {pestanasSemana.map((p) => (
            <button
              key={p.offset}
              type="button"
              onClick={() => setOffsetSemanas(p.offset)}
              className={`btn ${offsetSemanas === p.offset ? "btn--primary" : "btn--ghost"}`}
              style={{
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                lineHeight: 1.3,
                padding: "6px 14px",
              }}
            >
              <span style={{ fontSize: "0.78rem" }}>{p.etiqueta}</span>
              <strong style={{ fontSize: "0.85rem" }}>{p.rango}</strong>
            </button>
          ))}
          <button
            className="btn btn--ghost"
            type="button"
            onClick={() => setOffsetSemanas((o) => Math.min(0, o + 1))}
            disabled={esSemanaActual}
            aria-label="Semana siguiente"
            title={esSemanaActual ? "Ya estás en la semana actual" : "Semana siguiente"}
            style={{ flexShrink: 0 }}
          >
            ›
          </button>
        </div>
        </div>
      </div>
      {/* Botón "Crear tema" oculto (2026-08-19, a petición de Yue) -- se
          reemplaza por la fila "+ Agregar tema" directo en cada tabla de
          persona (ver KanbanSupervisores.jsx, FilaNuevoTema). El modal
          ModalEditarProyecto sigue existiendo tal cual (lo sigue usando
          "Editar tema"), solo se quitó este botón de creación. */}

      {/* Mismo Kanban de Seguimiento sin importar la semana elegida
          (2026-08-19, a petición de Yue: "consistencia" con la vista de
          "Esta semana") -- reemplaza la vista alterna Tabla/Resumen de
          solo lectura que antes se mostraba para semanas pasadas
          (ContenidoHistorialSemana/TablaHistorialSemana, ver
          HistorialMinutas.jsx). El Kanban siempre refleja el estado
          ACTUAL de los temas, no cómo se veían en esa semana específica
          -- decisión explícita: prioriza consistencia visual sobre
          precisión histórica real. */}
      <div className="stack" style={{ gap: 10, alignItems: "flex-end" }}>
        <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "flex-end", gap: 12 }}>
          <button
            type="button"
            className="btn btn--primary"
            style={{ fontSize: "0.85rem", padding: "4px 12px" }}
            onClick={() => setAsignandoTarea(true)}
          >
            + Asignar tarea
          </button>
          <input
            type="search"
            className="input"
            placeholder="Buscar persona..."
            value={busquedaPersona}
            onChange={(e) => setBusquedaPersona(e.target.value)}
            style={{ maxWidth: 220, fontSize: "0.85rem" }}
          />
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          {[
            { valor: "pendientes", etiqueta: "Pendientes" },
            { valor: "revisados", etiqueta: "Concluidos" },
          ].map((op) => {
            const marcado = filtrosTemas.has(op.valor);
            return (
              <button
                key={op.valor}
                type="button"
                onClick={() => toggleFiltroTemas(op.valor)}
                className={`btn ${marcado ? "btn--primary" : "btn--ghost"}`}
                style={{ fontSize: "0.82rem" }}
              >
                {op.etiqueta}
              </button>
            );
          })}
        </div>
      </div>

      {errorEliminar && <p className="error-text">{errorEliminar}</p>}
      {errorRevision && <p className="error-text">{errorRevision}</p>}
      {errorOrden && <p className="error-text">{errorOrden}</p>}

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
        itemPorTemaResuelto={itemPorTemaResuelto}
        onMarcarPendiente={marcarTemaPendiente}
        marcandoPendiente={marcandoPendiente}
        onMoverTema={moverTema}
        moviendoTema={moviendoTema}
        temasResueltos={temasResueltos}
        filtrosTemas={filtrosTemas}
        onCrearTema={crearTemaRapido}
        onCrearSubtema={crearSubtemaRapido}
        filtroPersona={busquedaPersona}
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

      {asignandoTarea && (
        <ModalAsignarTareaRapida
          equipo={miembros}
          onCerrar={() => setAsignandoTarea(false)}
          onCreado={async () => {
            setAsignandoTarea(false);
            await cargar();
          }}
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

import { useEffect, useState } from "react";
import { proyectosApi } from "../../api/endpoints";
import { useEventosTiempoReal } from "../../hooks/useEventosTiempoReal";
import ConfirmDialog from "../ConfirmDialog";
import FilaProyecto from "../FilaProyecto";
import ModalEditarProyecto from "../ModalEditarProyecto";

// "Mis proyectos" (2026-09-18, a petición de Yue) -- contenido de la
// tarjeta "Proyecto" en el grid "Quiero asignar": antes esa tarjeta abría
// directo el modal de "Crear proyecto" (ModalEditarProyecto) y no había
// ninguna forma de ver/editar/eliminar los proyectos ya existentes desde
// ahí. Se monta dentro de un <Modal> en AgendaPlanB.jsx, mismo patrón que
// "agenda"/"rendimiento" (CalendarioGlobal/RendimientoEquipo). Reusa
// proyectosApi.listar() (solo raíces visibles, ya filtrado por permisos en
// el backend) + FilaProyecto para expandir subtemas bajo demanda -- sin
// endpoints nuevos.
export default function ListaProyectos() {
  const [raices, setRaices] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  // Fuerza a remontar todo el árbol (y por lo tanto a recargar subtemas ya
  // expandidos) después de crear/editar/eliminar -- cada FilaProyecto cachea
  // sus propios hijos en estado local, así que solo cambiar `raices` no
  // alcanza para refrescar un nodo ya expandido más abajo.
  const [version, setVersion] = useState(0);

  const [modalCrear, setModalCrear] = useState(false);
  const [proyectoEditar, setProyectoEditar] = useState(null);
  const [proyectoEliminar, setProyectoEliminar] = useState(null);
  const [resumenEliminar, setResumenEliminar] = useState(null);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState("");

  const cargar = ({ silencioso = false } = {}) => {
    if (!silencioso) setCargando(true);
    setError("");
    proyectosApi
      .listar()
      .then(setRaices)
      .catch(() => setError("No se pudo cargar tus proyectos. Intenta de nuevo más tarde."))
      .finally(() => {
        if (!silencioso) setCargando(false);
      });
  };

  useEffect(() => cargar(), []);

  // Tiempo real (2026-09-18, a petición de Yue: "que todo sea
  // instantáneo") -- solo refresca la lista de raíces (nombre/activo/
  // nuevos proyectos), SIN forzar `version` -- eso remontaría todo el
  // árbol y colapsaría cualquier subtema que el usuario tuviera expandido
  // en ese momento, solo por un evento de otra parte del sistema que ni
  // siquiera toca este proyecto.
  useEventosTiempoReal(() => cargar({ silencioso: true }));

  const alGuardar = () => {
    setModalCrear(false);
    setProyectoEditar(null);
    setVersion((v) => v + 1);
    cargar();
  };

  const abrirConfirmarEliminar = async (proyecto) => {
    setErrorEliminar("");
    setProyectoEliminar(proyecto);
    try {
      const r = proyecto.tiene_hijos ? await proyectosApi.resumenSubarbol(proyecto.id) : null;
      setResumenEliminar(r);
    } catch {
      setErrorEliminar("No se pudo preparar la eliminación. Intenta de nuevo.");
    }
  };

  const confirmarEliminar = async () => {
    setEliminando(true);
    setErrorEliminar("");
    try {
      await proyectosApi.eliminar(proyectoEliminar.id);
      setProyectoEliminar(null);
      setVersion((v) => v + 1);
      cargar();
    } catch (err) {
      setErrorEliminar(err.response?.data?.detail || "No se pudo eliminar este proyecto.");
    } finally {
      setEliminando(false);
    }
  };

  const raicesFiltradas = raices.filter((p) =>
    p.nombre.toLowerCase().includes(busqueda.trim().toLowerCase())
  );

  return (
    <div className="stack">
      <button className="btn btn--primary" type="button" onClick={() => setModalCrear(true)}>
        + Crear proyecto
      </button>

      {cargando && <p>Cargando...</p>}
      {error && <p className="error-text">{error}</p>}

      {!cargando && !error && raices.length === 0 && (
        <p style={{ color: "var(--color-text-muted)" }}>
          Todavía no tienes proyectos. Crea el primero con el botón de arriba.
        </p>
      )}

      {!cargando && !error && raices.length > 0 && (
        <input
          className="input"
          type="search"
          placeholder="Buscar en tus proyectos..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          aria-label="Buscar en tus proyectos"
        />
      )}

      {!cargando && !error && raices.length > 0 && raicesFiltradas.length === 0 && (
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
          Ningún proyecto coincide con "{busqueda}".
        </p>
      )}

      {!cargando && !error && raicesFiltradas.length > 0 && (
        <div key={version} className="stack" style={{ gap: 4 }}>
          {raicesFiltradas.map((p) => (
            <FilaProyecto key={p.id} proyecto={p} onEditar={setProyectoEditar} />
          ))}
        </div>
      )}

      {modalCrear && <ModalEditarProyecto onGuardado={alGuardar} onCerrar={() => setModalCrear(false)} />}

      {proyectoEditar && (
        <ModalEditarProyecto
          proyecto={proyectoEditar}
          onGuardado={alGuardar}
          onCerrar={() => setProyectoEditar(null)}
          onEliminar={abrirConfirmarEliminar}
        />
      )}

      {proyectoEliminar && (
        <ConfirmDialog
          titulo="Eliminar proyecto"
          mensaje={
            resumenEliminar && resumenEliminar.total_subtemas > 0
              ? `¿Eliminar "${proyectoEliminar.nombre}"? Esto también borra ${resumenEliminar.total_subtemas} subtema(s), ${resumenEliminar.total_entregables} entregable(s) y ${resumenEliminar.total_reuniones} reunión(es) de todo su subárbol. Esta acción no se puede deshacer.`
              : `¿Eliminar el proyecto "${proyectoEliminar.nombre}"? Esto borra también su equipo, entregables y reuniones. Esta acción no se puede deshacer.`
          }
          textoConfirmar={eliminando ? "Eliminando..." : "Eliminar"}
          onConfirmar={confirmarEliminar}
          onCancelar={() => setProyectoEliminar(null)}
        >
          {errorEliminar && <p className="error-text">{errorEliminar}</p>}
        </ConfirmDialog>
      )}
    </div>
  );
}

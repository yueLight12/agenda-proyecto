import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { proyectosApi } from "../api/endpoints";
import { useAuth } from "../context/AuthContext";
import ModalEditarProyecto from "../components/ModalEditarProyecto";

export default function Proyectos() {
  const { usuario } = useAuth();
  const [proyectos, setProyectos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [errorCrear, setErrorCrear] = useState("");
  const [guardando, setGuardando] = useState(false);

  const [proyectoAEditar, setProyectoAEditar] = useState(null);
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

  const handleCrear = async (e) => {
    e.preventDefault();
    setErrorCrear("");
    setGuardando(true);
    try {
      await proyectosApi.crear({ nombre, descripcion: descripcion || null });
      setNombre("");
      setDescripcion("");
      setMostrarFormulario(false);
      await cargarProyectos();
    } catch (err) {
      setErrorCrear(err.response?.data?.detail || "No se pudo crear el proyecto.");
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminar = async (proyecto) => {
    setErrorEliminar("");
    if (
      !window.confirm(
        `¿Eliminar el proyecto "${proyecto.nombre}"? Esto borra también su equipo, entregables y reuniones. Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }
    try {
      await proyectosApi.eliminar(proyecto.id);
      await cargarProyectos();
    } catch (err) {
      setErrorEliminar(err.response?.data?.detail || "No se pudo eliminar el proyecto.");
    }
  };

  if (cargando) return <p>Cargando proyectos...</p>;
  if (error) return <p className="error-text">{error}</p>;

  return (
    <div className="stack">
      <div className="list-inline">
        <h1>Tus proyectos</h1>
        <button className="btn btn--primary" onClick={() => setMostrarFormulario((v) => !v)}>
          {mostrarFormulario ? "Cancelar" : "Crear proyecto"}
        </button>
      </div>

      {mostrarFormulario && (
        <form className="stack card" onSubmit={handleCrear} style={{ maxWidth: 420 }}>
          <label className="stack" style={{ gap: 4 }}>
            <span style={{ fontSize: "0.85rem" }}>Nombre del proyecto</span>
            <input
              className="input"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
            />
          </label>
          <label className="stack" style={{ gap: 4 }}>
            <span style={{ fontSize: "0.85rem" }}>Descripción (opcional)</span>
            <input
              className="input"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
            />
          </label>
          {errorCrear && <p className="error-text">{errorCrear}</p>}
          <button className="btn btn--primary" type="submit" disabled={guardando}>
            {guardando ? "Creando..." : "Crear"}
          </button>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.8rem" }}>
            Quedarás como N1 (dirección) de este proyecto y podrás agregar al resto del equipo
            desde "Administrar equipo".
          </p>
        </form>
      )}

      {errorEliminar && <p className="error-text">{errorEliminar}</p>}

      {proyectos.length === 0 && (
        <p style={{ color: "var(--color-text-muted)" }}>
          No tienes proyectos asignados todavía.
        </p>
      )}
      <div className="grid-summary">
        {proyectos.map((p) => (
          <div key={p.id} className="card stack" style={{ gap: 8 }}>
            <Link to={`/proyectos/${p.id}`} style={{ textDecoration: "none", color: "inherit" }}>
              <h3 style={{ fontSize: "1.05rem", margin: 0 }}>
                {p.nombre}
                {!p.activo && (
                  <span className="badge" style={{ marginLeft: 8, fontSize: "0.7rem" }}>
                    Inactivo
                  </span>
                )}
              </h3>
              <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
                {p.descripcion || "Sin descripción"}
              </p>
            </Link>
            {esN1DelProyecto(p.id) && (
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="btn btn--ghost"
                  type="button"
                  onClick={() => setProyectoAEditar(p)}
                >
                  Editar
                </button>
                <button
                  className="btn btn--ghost"
                  type="button"
                  onClick={() => handleEliminar(p)}
                >
                  Eliminar
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {proyectoAEditar && (
        <ModalEditarProyecto
          proyecto={proyectoAEditar}
          onGuardado={async () => {
            setProyectoAEditar(null);
            await cargarProyectos();
          }}
          onCerrar={() => setProyectoAEditar(null)}
        />
      )}
    </div>
  );
}

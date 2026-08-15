import { useEffect, useState } from "react";
import { entregablesApi, proyectosApi } from "../api/endpoints";
import { useAuth } from "../context/AuthContext";
import EstatusBadge from "../components/EstatusBadge";
import FormularioEntregable from "../components/FormularioEntregable";

export default function MisPendientes() {
  const { usuario } = useAuth();
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const [entregableAbierto, setEntregableAbierto] = useState(null);
  const [miembrosProyecto, setMiembrosProyecto] = useState([]);
  const [errorAbrir, setErrorAbrir] = useState("");

  const puedeAsignarAOtros = (proyectoId) =>
    usuario?.es_super_admin ||
    ["N1", "N2"].includes(
      usuario?.roles_por_proyecto.find((r) => r.proyecto_id === proyectoId)?.rol
    );

  const cargar = async () => {
    const proyectos = await proyectosApi.listar();
    const listas = await Promise.all(
      proyectos.map((p) => entregablesApi.listarPorProyecto(p.id).then((es) => ({ p, es })))
    );
    const propios = listas.flatMap(({ p, es }) =>
      es
        .filter((e) => e.responsable_id === usuario.id && e.estatus !== "cumplido")
        .map((e) => ({ ...e, proyecto_nombre: p.nombre }))
    );
    propios.sort((a, b) => (a.fecha_entrega > b.fecha_entrega ? 1 : -1));
    setItems(propios);
  };

  useEffect(() => {
    if (usuario) {
      cargar()
        .catch(() => setError("No se pudieron cargar tus pendientes. Intenta de nuevo más tarde."))
        .finally(() => setCargando(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario]);

  const abrir = async (entregable) => {
    setErrorAbrir("");
    try {
      const eq = await proyectosApi.equipo(entregable.proyecto_id);
      setMiembrosProyecto(eq);
      setEntregableAbierto(entregable);
    } catch {
      setErrorAbrir("No se pudo abrir el entregable. Intenta de nuevo.");
    }
  };

  if (cargando) return <p>Cargando tus pendientes...</p>;
  if (error) return <p className="error-text">{error}</p>;

  return (
    <div className="stack">
      <h1>Mis pendientes</h1>
      {errorAbrir && <p className="error-text">{errorAbrir}</p>}
      {items.length === 0 && (
        <p style={{ color: "var(--color-text-muted)" }}>
          No tienes entregables pendientes. 🎉
        </p>
      )}
      <div className="stack">
        {items.map((e) => (
          <button
            key={e.id}
            type="button"
            className="card"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              width: "100%",
              textAlign: "left",
              font: "inherit",
              color: "inherit",
              border: "1px solid var(--color-border)",
              cursor: "pointer",
            }}
            onClick={() => abrir(e)}
          >
            <div>
              <div style={{ fontWeight: 600 }}>{e.nombre}</div>
              <div style={{ fontSize: "0.82rem", color: "var(--color-text-muted)" }}>
                {e.proyecto_nombre} · vence {e.fecha_entrega}
              </div>
            </div>
            <EstatusBadge estatus={e.estatus} />
          </button>
        ))}
      </div>

      {entregableAbierto && (
        <FormularioEntregable
          proyectoId={entregableAbierto.proyecto_id}
          entregable={entregableAbierto}
          miembros={miembrosProyecto}
          puedeAsignarAOtros={puedeAsignarAOtros(entregableAbierto.proyecto_id)}
          usuarioActualId={usuario?.id}
          onGuardado={async () => {
            setEntregableAbierto(null);
            await cargar();
          }}
          onCerrar={() => setEntregableAbierto(null)}
        />
      )}
    </div>
  );
}

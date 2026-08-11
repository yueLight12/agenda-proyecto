import { useEffect, useState } from "react";
import { entregablesApi, proyectosApi } from "../api/endpoints";
import { useAuth } from "../context/AuthContext";
import EstatusBadge from "../components/EstatusBadge";

export default function MisPendientes() {
  const { usuario } = useAuth();
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
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
    if (usuario) {
      cargar()
        .catch(() => setError("No se pudieron cargar tus pendientes. Intenta de nuevo más tarde."))
        .finally(() => setCargando(false));
    }
  }, [usuario]);

  if (cargando) return <p>Cargando tus pendientes...</p>;
  if (error) return <p className="error-text">{error}</p>;

  return (
    <div className="stack">
      <h1>Mis pendientes</h1>
      {items.length === 0 && (
        <p style={{ color: "var(--color-text-muted)" }}>
          No tienes entregables pendientes. 🎉
        </p>
      )}
      <div className="stack">
        {items.map((e) => (
          <div key={e.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 600 }}>{e.nombre}</div>
              <div style={{ fontSize: "0.82rem", color: "var(--color-text-muted)" }}>
                {e.proyecto_nombre} · vence {e.fecha_entrega}
              </div>
            </div>
            <EstatusBadge estatus={e.estatus} />
          </div>
        ))}
      </div>
    </div>
  );
}

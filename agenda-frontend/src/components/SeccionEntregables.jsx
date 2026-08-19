import { useEffect, useState } from "react";
import { entregablesApi, proyectosApi } from "../api/endpoints";
import { useAuth } from "../context/AuthContext";
import FormularioEntregable from "./FormularioEntregable";

/**
 * Lista compacta de entregables de un tema + "+ Nuevo", pensada para vivir
 * dentro del panel lateral de Accionables (2026-08-19, a petición de Yue:
 * hoy la única forma de ver/crear entregables es entrando al tema en
 * TableroProyecto.jsx -- este componente lo trae directo a Seguimiento).
 * No reinventa el formulario: crear/editar/avance/histórico siguen siendo
 * el mismo FormularioEntregable de siempre, solo que se abre desde aquí en
 * vez de desde la página del tema.
 */
export default function SeccionEntregables({ proyectoId, puedeAdministrar = false }) {
  const { usuario } = useAuth();
  const [entregables, setEntregables] = useState([]);
  const [miembros, setMiembros] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [formulario, setFormulario] = useState(null); // "nuevo" | entregable | null

  const cargar = () =>
    Promise.all([entregablesApi.listarPorProyecto(proyectoId), proyectosApi.equipo(proyectoId)])
      .then(([es, eq]) => {
        setEntregables(es);
        setMiembros(eq);
      })
      .catch(() => setError("No se pudieron cargar los entregables."))
      .finally(() => setCargando(false));

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyectoId]);

  const hoyIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h4 style={{ fontSize: "0.85rem", margin: 0 }}>Entregables</h4>
        <button
          className="btn btn--ghost"
          type="button"
          onClick={() => setFormulario("nuevo")}
          style={{ fontSize: "0.78rem", padding: "2px 8px" }}
        >
          + Nuevo
        </button>
      </div>

      {cargando ? (
        <p style={{ fontSize: "0.85rem" }}>Cargando...</p>
      ) : error ? (
        <p className="error-text" style={{ fontSize: "0.85rem" }}>{error}</p>
      ) : entregables.length === 0 ? (
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
          Aún no hay entregables — agrega el primero con "+ Nuevo".
        </p>
      ) : (
        entregables.map((e) => {
          const vencido = e.estatus !== "cumplido" && e.fecha_entrega < hoyIso;
          const responsable = miembros.find((m) => m.usuario_id === e.responsable_id);
          return (
            <button
              key={e.id}
              type="button"
              className="btn btn--ghost"
              onClick={() => setFormulario(e)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                width: "100%",
                textAlign: "left",
                padding: "6px 8px",
                fontSize: "0.82rem",
              }}
            >
              <span>
                {e.nombre}
                <span style={{ display: "block", fontSize: "0.72rem", color: "var(--color-text-muted)" }}>
                  {responsable?.nombre || "—"} · vence {e.fecha_entrega}
                </span>
              </span>
              <span
                style={{
                  fontWeight: 600,
                  fontSize: "0.75rem",
                  whiteSpace: "nowrap",
                  color: vencido
                    ? "var(--color-danger)"
                    : e.estatus === "cumplido"
                    ? "var(--color-teal-600)"
                    : "var(--color-text-muted)",
                }}
              >
                {e.estatus === "cumplido" ? "✓ 100%" : vencido ? `🔴 ${e.porcentaje_avance}%` : `${e.porcentaje_avance}%`}
              </span>
            </button>
          );
        })
      )}

      {formulario && (
        <FormularioEntregable
          proyectoId={proyectoId}
          entregable={formulario === "nuevo" ? null : formulario}
          miembros={miembros}
          puedeAsignarAOtros={puedeAdministrar}
          usuarioActualId={usuario?.id}
          onGuardado={async () => {
            setFormulario(null);
            await cargar();
          }}
          onCerrar={() => setFormulario(null)}
        />
      )}
    </div>
  );
}

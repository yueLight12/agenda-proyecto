import { useEffect, useState } from "react";
import { notasApi } from "../api/endpoints";
import { useAuth } from "../context/AuthContext";

/**
 * Sección reutilizable de notas/avisos/pendientes, para colgar de un
 * entregable, una reunión o una minuta (exactamente uno de los tres props
 * de id). El backend ya valida quién puede ver/crear/borrar (la nota
 * hereda la visibilidad de su padre, ver app/services/notas.py) — esta
 * sección no duplica esa lógica, solo maneja qué botones mostrar:
 * "Eliminar" se ofrece al autor de cada nota, y además a quien pueda
 * administrar el padre (`puedeAdministrar`, ej. N1/N2 del proyecto) si el
 * componente que la usa se lo indica.
 */
export default function SeccionNotas({ entregableId, reunionId, minutaId, puedeAdministrar = false }) {
  const { usuario } = useAuth();
  const [notas, setNotas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [contenido, setContenido] = useState("");
  const [enviando, setEnviando] = useState(false);

  const params = entregableId
    ? { entregable_id: entregableId }
    : reunionId
    ? { reunion_id: reunionId }
    : { minuta_id: minutaId };

  const cargar = () =>
    notasApi
      .listar(params)
      .then(setNotas)
      .catch(() => setError("No se pudieron cargar las notas."))
      .finally(() => setCargando(false));

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entregableId, reunionId, minutaId]);

  const handleAgregar = async (e) => {
    e.preventDefault();
    if (!contenido.trim()) return;
    setError("");
    setEnviando(true);
    try {
      await notasApi.crear({ ...params, contenido });
      setContenido("");
      await cargar();
    } catch (err) {
      setError(err.response?.data?.detail || "No se pudo agregar la nota.");
    } finally {
      setEnviando(false);
    }
  };

  const handleEliminar = async (notaId) => {
    if (!window.confirm("¿Eliminar esta nota?")) return;
    try {
      await notasApi.eliminar(notaId);
      await cargar();
    } catch {
      setError("No se pudo eliminar la nota.");
    }
  };

  return (
    <div className="stack" style={{ gap: 8 }}>
      <h4 style={{ fontSize: "0.85rem", margin: 0 }}>Notas / avisos / pendientes</h4>

      {error && <p className="error-text">{error}</p>}

      {cargando ? (
        <p style={{ fontSize: "0.85rem" }}>Cargando notas...</p>
      ) : (
        <>
          {notas.length === 0 && (
            <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
              Todavía no hay notas.
            </p>
          )}
          {notas.map((n) => (
            <div key={n.id} className="list-inline" style={{ alignItems: "flex-start" }}>
              <div>
                <p style={{ margin: 0 }}>{n.contenido}</p>
                <span style={{ color: "var(--color-text-muted)", fontSize: "0.78rem" }}>
                  {n.autor_nombre} —{" "}
                  {new Date(n.fecha_creacion).toLocaleString("es-MX", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
              </div>
              {(n.autor_id === usuario?.id || puedeAdministrar) && (
                <button className="btn btn--ghost" type="button" onClick={() => handleEliminar(n.id)}>
                  Eliminar
                </button>
              )}
            </div>
          ))}
        </>
      )}

      <form className="stack" style={{ gap: 4 }} onSubmit={handleAgregar}>
        <textarea
          className="input"
          rows={2}
          placeholder="Agregar una nota, aviso o pendiente..."
          value={contenido}
          onChange={(e) => setContenido(e.target.value)}
        />
        <button
          className="btn btn--ghost"
          type="submit"
          disabled={enviando || !contenido.trim()}
          style={{ alignSelf: "flex-start" }}
        >
          {enviando ? "Agregando..." : "Agregar nota"}
        </button>
      </form>
    </div>
  );
}

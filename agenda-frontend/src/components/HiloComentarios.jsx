import { useEffect, useState } from "react";
import { notasApi } from "../api/endpoints";

// Miniatura de la imagen adjunta a un comentario -- mismo patrón que
// ImagenNota en SeccionNotas.jsx (blob autenticado, se libera al
// desmontar/cambiar).
function ImagenComentario({ notaId }) {
  const [url, setUrl] = useState(null);
  const [ampliada, setAmpliada] = useState(false);

  useEffect(() => {
    let cancelado = false;
    let objectUrl = null;
    notasApi.imagenBlobUrl(notaId).then((u) => {
      if (cancelado) {
        URL.revokeObjectURL(u);
        return;
      }
      objectUrl = u;
      setUrl(u);
    });
    return () => {
      cancelado = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [notaId]);

  if (!url) return null;

  return (
    <>
      <img
        src={url}
        alt="Captura adjunta"
        style={{ maxWidth: 140, maxHeight: 100, borderRadius: 6, marginTop: 4, cursor: "zoom-in", display: "block" }}
        onClick={() => setAmpliada(true)}
      />
      {ampliada && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.75)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
          }}
          onClick={() => setAmpliada(false)}
        >
          <img src={url} alt="Captura adjunta" style={{ maxWidth: "90%", maxHeight: "90%", borderRadius: 6 }} />
        </div>
      )}
    </>
  );
}

/**
 * Hilo de comentarios anidados sobre un Aviso (Nota), un Pendiente, o
 * sobre OTRO comentario -- 2026-08-18, a petición de Yue: "si una
 * nota/aviso/pendiente ya fue agregada, se le puede anexar una imagen o
 * dejar otro comentario y quede anidado", ampliado el mismo día a
 * profundidad sin límite ("David comenta, Bernardo responde a ese
 * comentario con una imagen"). Cada comentario es él mismo una Nota
 * (nota_padre_id apuntando al padre -- Aviso, Pendiente vía
 * pendiente_padre_id, u otro comentario), así que este componente se usa
 * recursivamente: cada comentario renderiza su propio hilo de respuestas.
 * Colapsado por default en todos los niveles, se carga bajo demanda al
 * expandir -- así un hilo largo no dispara decenas de requests de golpe.
 *
 * `padreParams`: `{ nota_padre_id }` o `{ pendiente_padre_id }` -- exactamente
 * uno, mismo contrato que NotaCrear/GET /notas del backend.
 */
export default function HiloComentarios({ padreParams, nivel = 0 }) {
  const [expandido, setExpandido] = useState(false);
  const [comentarios, setComentarios] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [contenido, setContenido] = useState("");
  const [imagen, setImagen] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  const cargar = () => {
    setCargando(true);
    notasApi
      .listar(padreParams)
      .then(setComentarios)
      .catch(() => setError("No se pudieron cargar los comentarios."))
      .finally(() => setCargando(false));
  };

  const toggle = () => {
    const abriendo = !expandido;
    setExpandido(abriendo);
    if (abriendo && comentarios.length === 0) cargar();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!contenido.trim()) return;
    setEnviando(true);
    setError("");
    try {
      const nuevo = await notasApi.crear({ ...padreParams, contenido: contenido.trim() });
      if (imagen) {
        try {
          await notasApi.subirImagen(nuevo.id, imagen);
        } catch {
          setError("El comentario se guardó, pero no se pudo subir la imagen.");
        }
      }
      setContenido("");
      setImagen(null);
      cargar();
    } catch (err) {
      setError(err.response?.data?.detail || "No se pudo agregar el comentario.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div style={{ marginTop: 4 }}>
      <button
        type="button"
        onClick={toggle}
        style={{
          background: "none", border: "none", padding: 0, cursor: "pointer",
          fontSize: "0.72rem", color: "var(--color-teal-600)",
        }}
      >
        💬 {expandido ? "Ocultar" : nivel === 0 ? "Comentarios / imagen" : "Ver respuestas / responder"}
      </button>
      {expandido && (
        <div className="stack" style={{ gap: 4, marginTop: 4, paddingLeft: 8, borderLeft: "2px solid var(--color-border)" }}>
          {cargando && <p style={{ fontSize: "0.72rem", color: "var(--color-text-muted)", margin: 0 }}>Cargando...</p>}
          {!cargando && comentarios.length === 0 && (
            <p style={{ fontSize: "0.72rem", color: "var(--color-text-muted)", margin: 0 }}>Sin comentarios todavía.</p>
          )}
          {comentarios.map((c) => (
            <div key={c.id} style={{ fontSize: "0.75rem" }}>
              <p style={{ margin: 0 }}>{c.contenido}</p>
              <span style={{ color: "var(--color-text-muted)", fontSize: "0.68rem" }}>
                {c.autor_nombre} —{" "}
                {new Date(c.fecha_creacion).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}
              </span>
              {c.tiene_imagen && <ImagenComentario notaId={c.id} />}
              <HiloComentarios padreParams={{ nota_padre_id: c.id }} nivel={nivel + 1} />
            </div>
          ))}
          {error && <p className="error-text" style={{ fontSize: "0.72rem", margin: 0 }}>{error}</p>}
          <form onSubmit={handleSubmit} className="stack" style={{ gap: 4 }}>
            <textarea
              className="input"
              rows={2}
              style={{ fontSize: "0.75rem" }}
              placeholder="Agregar un comentario..."
              value={contenido}
              onChange={(e) => setContenido(e.target.value)}
            />
            {/* Deshabilitado (2026-09-18, a petición de Yue) -- mismo criterio de
                "ocultar, no eliminar" ya usado en FormularioEntregable.jsx con el
                comprobante de imagen. */}
            {false && (
              <label style={{ fontSize: "0.7rem", color: "var(--color-text-muted)" }}>
                Adjuntar imagen (opcional)
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => setImagen(e.target.files?.[0] || null)}
                  style={{ display: "block", marginTop: 2, fontSize: "0.72rem" }}
                />
              </label>
            )}
            <button
              className="btn btn--ghost"
              type="submit"
              disabled={enviando || !contenido.trim()}
              style={{ fontSize: "0.72rem", alignSelf: "flex-start" }}
            >
              {enviando ? "Agregando..." : "Agregar comentario"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

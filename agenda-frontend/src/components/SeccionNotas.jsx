import { useEffect, useState } from "react";
import { notasApi, pendientesApi } from "../api/endpoints";
import { useAuth } from "../context/AuthContext";
import ConfirmDialog from "./ConfirmDialog";
import HiloComentarios from "./HiloComentarios";

// Miniatura de la captura de pantalla de una nota -- pide el blob
// autenticado (no se puede usar la URL del endpoint directo en <img src>,
// ver notasApi.imagenBlobUrl) y libera el object URL al desmontar/cambiar
// de nota, para no ir acumulando memoria.
function ImagenNota({ notaId }) {
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
        alt="Captura de pantalla adjunta"
        style={{ maxWidth: 160, maxHeight: 120, borderRadius: 6, marginTop: 6, cursor: "zoom-in", display: "block" }}
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
          <img src={url} alt="Captura de pantalla adjunta" style={{ maxWidth: "90%", maxHeight: "90%", borderRadius: 6 }} />
        </div>
      )}
    </>
  );
}

/**
 * Sección reutilizable de notas/avisos/pendientes, para colgar de un
 * entregable, una reunión, una minuta o un proyecto/tema (exactamente uno
 * de los cuatro props de id). El backend ya valida quién puede
 * ver/crear/borrar (la nota hereda la visibilidad de su padre, ver
 * app/services/notas.py) — esta sección no duplica esa lógica, solo maneja
 * qué botones mostrar: "Eliminar" se ofrece al autor de cada nota, y
 * además a quien pueda administrar el padre (`puedeAdministrar`, ej. N1/N2
 * del proyecto) si el componente que la usa se lo indica.
 *
 * Una nota sobre un proyecto/tema (2026-08-17, caso Diana) también puede
 * jalarse como un punto más del checklist de una junta recurrente general
 * -- ver ModalSerieReunion.jsx (tipo "nota").
 *
 * `temaId` (2026-08-17, reuniones sueltas): si se manda, además del padre
 * normal de la nota (entregable/reunión/minuta/proyecto), se ofrece un
 * selector para REUTILIZAR el contenido de una nota o pendiente ya
 * existente en ese tema -- copia el texto al textarea (la nota que se crea
 * sigue siendo una nota nueva, propia de este padre; no se "liga" a la
 * original, ya que Nota no soporta más de un padre y ninguna de las dos se
 * edita después de creada, así que copiar el texto es equivalente a
 * enlazarlo en la práctica, sin tocar el modelo). No aplica en juntas
 * generales (temaId null) -- mismo límite que ya tiene el picker de
 * ModalSerieReunion.
 */
export default function SeccionNotas({
  entregableId,
  reunionId,
  minutaId,
  proyectoId,
  temaId = null,
  puedeAdministrar = false,
  tituloPersonalizado = null,
  // Texto del botón/placeholder personalizables (2026-08-22, ver
  // FormularioEntregable.jsx: en un entregable esta sección se presenta
  // como "mensajes" en vez de "notas") -- default conserva el texto de
  // siempre para los demás usos (reuniones, proyectos, minutas).
  textoBoton = null,
  placeholderTexto = null,
  // Texto cuando todavía no hay ninguna nota (2026-08-25, a petición de Yue
  // para simplificar "Editar reunión": ahí queda solo "Notas" sin el texto
  // largo de aviso/pendiente) -- default conserva el texto de siempre.
  textoVacio = "Aún no hay notas — escribe la primera abajo.",
}) {
  const { usuario } = useAuth();
  const [notas, setNotas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [contenido, setContenido] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(null);
  const [eliminando, setEliminando] = useState(false);
  const [notasTema, setNotasTema] = useState([]);
  const [pendientesTema, setPendientesTema] = useState([]);
  const [reutilizarId, setReutilizarId] = useState("");
  const [imagen, setImagen] = useState(null);

  const params = entregableId
    ? { entregable_id: entregableId }
    : reunionId
    ? { reunion_id: reunionId }
    : minutaId
    ? { minuta_id: minutaId }
    : { proyecto_id: proyectoId };

  const cargar = () =>
    notasApi
      .listar(params)
      .then(setNotas)
      .catch(() => setError("No se pudieron cargar las notas."))
      .finally(() => setCargando(false));

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entregableId, reunionId, minutaId, proyectoId]);

  useEffect(() => {
    if (!temaId) {
      setNotasTema([]);
      setPendientesTema([]);
      return;
    }
    notasApi.listar({ proyecto_id: temaId }).then(setNotasTema).catch(() => setNotasTema([]));
    pendientesApi
      .listar({ proyecto_id: temaId })
      .then(setPendientesTema)
      .catch(() => setPendientesTema([]));
  }, [temaId]);

  const opcionesReutilizar = [
    ...notasTema.map((n) => ({ clave: `nota-${n.id}`, contenido: n.contenido, etiqueta: `Nota: ${n.contenido.slice(0, 50)}` })),
    ...pendientesTema.map((p) => ({
      clave: `pendiente-${p.id}`,
      contenido: p.contenido,
      etiqueta: `Pendiente: ${p.contenido.slice(0, 50)}`,
    })),
  ];

  const handleReutilizar = (clave) => {
    setReutilizarId(clave);
    const opcion = opcionesReutilizar.find((o) => o.clave === clave);
    if (opcion) setContenido(opcion.contenido);
  };

  const handleAgregar = async (e) => {
    e.preventDefault();
    if (!contenido.trim()) return;
    setError("");
    setEnviando(true);
    try {
      const nueva = await notasApi.crear({ ...params, contenido });
      if (imagen) {
        // Se sube aparte (POST /notas sigue siendo JSON puro) -- si la
        // nota ya se creó pero la imagen falla, se avisa sin perder la
        // nota (ya quedó guardada con su texto).
        try {
          await notasApi.subirImagen(nueva.id, imagen);
        } catch {
          setError("La nota se guardó, pero no se pudo subir la imagen.");
        }
      }
      setContenido("");
      setReutilizarId("");
      setImagen(null);
      await cargar();
    } catch (err) {
      setError(err.response?.data?.detail || "No se pudo agregar la nota.");
    } finally {
      setEnviando(false);
    }
  };

  const handleEliminar = (notaId) => {
    setError("");
    setConfirmandoEliminar(notaId);
  };

  const confirmarEliminar = async () => {
    setEliminando(true);
    try {
      await notasApi.eliminar(confirmandoEliminar);
      setConfirmandoEliminar(null);
      await cargar();
    } catch {
      setError("No se pudo eliminar la nota.");
    } finally {
      setEliminando(false);
    }
  };

  return (
    <div className="stack" style={{ gap: 8 }}>
      <h4 style={{ fontSize: "0.85rem", margin: 0 }}>
        {tituloPersonalizado || "Notas / avisos / pendientes"}
      </h4>

      {error && <p className="error-text">{error}</p>}

      {cargando ? (
        <p style={{ fontSize: "0.85rem" }}>Cargando notas...</p>
      ) : (
        <>
          {notas.length === 0 && (
            <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
              {textoVacio}
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
                {n.tiene_imagen && <ImagenNota notaId={n.id} />}
                <HiloComentarios padreParams={{ nota_padre_id: n.id }} />
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
        {temaId && opcionesReutilizar.length > 0 && (
          <select
            className="input"
            value={reutilizarId}
            onChange={(e) => handleReutilizar(e.target.value)}
          >
            <option value="">Reutilizar una nota o pendiente ya escrito en este proyecto...</option>
            {opcionesReutilizar.map((o) => (
              <option key={o.clave} value={o.clave}>
                {o.etiqueta}
              </option>
            ))}
          </select>
        )}
        <textarea
          className="input"
          rows={2}
          placeholder={placeholderTexto || "Agregar una nota, aviso o pendiente..."}
          value={contenido}
          onChange={(e) => setContenido(e.target.value)}
        />
        <label style={{ fontSize: "0.78rem", color: "var(--color-text-muted)" }}>
          Adjuntar captura de pantalla (opcional)
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => setImagen(e.target.files?.[0] || null)}
            style={{ display: "block", marginTop: 4, fontSize: "0.78rem" }}
          />
        </label>
        <button
          className="btn btn--ghost"
          type="submit"
          disabled={enviando || !contenido.trim()}
          style={{ alignSelf: "flex-start" }}
        >
          {enviando ? (textoBoton ? "Enviando..." : "Agregando...") : textoBoton || "Agregar nota"}
        </button>
      </form>

      {confirmandoEliminar !== null && (
        <ConfirmDialog
          titulo="Eliminar nota"
          mensaje="¿Eliminar esta nota?"
          textoConfirmar={eliminando ? "Eliminando..." : "Eliminar"}
          onConfirmar={confirmarEliminar}
          onCancelar={() => setConfirmandoEliminar(null)}
        />
      )}
    </div>
  );
}

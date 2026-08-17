import { useEffect, useState } from "react";
import { minutasApi } from "../api/endpoints";
import { etiquetaRol } from "../utils/rolLabels";
import ConfirmDialog from "./ConfirmDialog";
import Modal from "./Modal";
import SeccionAgendaSerie from "./SeccionAgendaSerie";
import SeccionNotas from "./SeccionNotas";

/**
 * Minuta de una reunión: notas libres + acuerdos, con la opción de
 * convertir cada acuerdo en un entregable real (con responsable y fecha
 * límite). `miembros` es el equipo visible del proyecto, mismo formato que
 * usa ModalReunion/FormularioEntregable.
 */
export default function ModalMinuta({ reunion, miembros, puedeAdministrar = false, onCerrar }) {
  const [minuta, setMinuta] = useState(null);
  const [contenido, setContenido] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const [descripcionAcuerdo, setDescripcionAcuerdo] = useState("");
  const [responsableAcuerdo, setResponsableAcuerdo] = useState("");
  const [agregandoAcuerdo, setAgregandoAcuerdo] = useState(false);

  const [fechaConversion, setFechaConversion] = useState({});
  const [convirtiendo, setConvirtiendo] = useState(null);

  const [confirmandoEliminarAcuerdo, setConfirmandoEliminarAcuerdo] = useState(null);
  const [eliminandoAcuerdo, setEliminandoAcuerdo] = useState(false);

  const cargar = () =>
    minutasApi
      .obtener(reunion.id)
      .then((m) => {
        setMinuta(m);
        setContenido(m.contenido || "");
      })
      .catch((err) => {
        if (err.response?.status === 404) {
          setMinuta(null); // todavía no existe, se crea al guardar
        } else {
          setError("No se pudo cargar la minuta.");
        }
      })
      .finally(() => setCargando(false));

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reunion.id]);

  const handleGuardarContenido = async (e) => {
    e.preventDefault();
    setError("");
    setGuardando(true);
    try {
      const m = await minutasApi.guardar(reunion.id, contenido);
      setMinuta(m);
    } catch {
      setError("No se pudo guardar la minuta.");
    } finally {
      setGuardando(false);
    }
  };

  const handleAgregarAcuerdo = async (e) => {
    e.preventDefault();
    setError("");
    if (!minuta) {
      setError("Primero guarda el contenido de la minuta.");
      return;
    }
    setAgregandoAcuerdo(true);
    try {
      await minutasApi.agregarAcuerdo(minuta.id, {
        descripcion: descripcionAcuerdo,
        responsable_id: responsableAcuerdo ? Number(responsableAcuerdo) : null,
      });
      setDescripcionAcuerdo("");
      setResponsableAcuerdo("");
      await cargar();
    } catch (err) {
      setError(err.response?.data?.detail || "No se pudo agregar el acuerdo.");
    } finally {
      setAgregandoAcuerdo(false);
    }
  };

  const handleEliminarAcuerdo = (acuerdoId) => {
    setError("");
    setConfirmandoEliminarAcuerdo(acuerdoId);
  };

  const confirmarEliminarAcuerdo = async () => {
    setEliminandoAcuerdo(true);
    try {
      await minutasApi.eliminarAcuerdo(confirmandoEliminarAcuerdo);
      setConfirmandoEliminarAcuerdo(null);
      await cargar();
    } catch {
      setError("No se pudo eliminar el acuerdo.");
    } finally {
      setEliminandoAcuerdo(false);
    }
  };

  const handleConvertir = async (acuerdo) => {
    const fecha = fechaConversion[acuerdo.id];
    if (!fecha) {
      setError("Elige una fecha límite antes de convertir el acuerdo.");
      return;
    }
    setError("");
    setConvirtiendo(acuerdo.id);
    try {
      await minutasApi.convertirAcuerdo(acuerdo.id, { fecha_entrega: fecha });
      await cargar();
    } catch (err) {
      setError(err.response?.data?.detail || "No se pudo convertir el acuerdo en entregable.");
    } finally {
      setConvirtiendo(null);
    }
  };

  return (
    <Modal titulo={`Minuta — ${reunion.titulo}`} onCerrar={onCerrar}>
      {cargando ? (
        <p>Cargando minuta...</p>
      ) : (
        <div className="stack">
          {reunion.serie_id && (
            <div style={{ borderBottom: "1px solid var(--color-border)", paddingBottom: 16 }}>
              <h3 style={{ fontSize: "0.9rem", margin: "0 0 8px" }}>Agenda de esta reunión</h3>
              <SeccionAgendaSerie serieId={reunion.serie_id} reunionId={reunion.id} />
            </div>
          )}

          <form className="stack" onSubmit={handleGuardarContenido}>
            <label className="stack" style={{ gap: 4 }}>
              <span style={{ fontSize: "0.85rem" }}>Notas / acuerdos generales</span>
              <textarea
                className="input"
                rows={4}
                value={contenido}
                onChange={(e) => setContenido(e.target.value)}
              />
            </label>
            <button className="btn btn--primary" type="submit" disabled={guardando} style={{ alignSelf: "flex-start" }}>
              {guardando ? "Guardando..." : "Guardar minuta"}
            </button>
          </form>

          {error && <p className="error-text">{error}</p>}

          {minuta && (
            <div className="stack">
              <h3 style={{ fontSize: "0.9rem", margin: 0 }}>Acuerdos</h3>

              {minuta.acuerdos.length === 0 && (
                <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
                  Aún no hay acuerdos — agrega el primero abajo.
                </p>
              )}

              {minuta.acuerdos.map((a) => (
                <div key={a.id} className="card stack" style={{ gap: 6, padding: 10 }}>
                  <div className="list-inline" style={{ borderBottom: "none", padding: 0 }}>
                    <div>
                      <strong>{a.descripcion}</strong>
                      {a.responsable_nombre && (
                        <span style={{ color: "var(--color-text-muted)", fontSize: "0.8rem" }}>
                          {" "}
                          — responsable: {a.responsable_nombre}
                        </span>
                      )}
                    </div>
                    {!a.convertido && (
                      <button className="btn btn--ghost" type="button" onClick={() => handleEliminarAcuerdo(a.id)}>
                        Eliminar
                      </button>
                    )}
                  </div>

                  {a.convertido ? (
                    <span style={{ fontSize: "0.8rem", color: "var(--color-success, green)" }}>
                      Convertido en entregable ✓
                    </span>
                  ) : a.responsable_id ? (
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        className="input"
                        type="date"
                        style={{ maxWidth: 160 }}
                        value={fechaConversion[a.id] || ""}
                        onChange={(e) =>
                          setFechaConversion((prev) => ({ ...prev, [a.id]: e.target.value }))
                        }
                      />
                      <button
                        className="btn btn--ghost"
                        type="button"
                        disabled={convirtiendo === a.id}
                        onClick={() => handleConvertir(a)}
                      >
                        {convirtiendo === a.id ? "Convirtiendo..." : "Convertir en entregable"}
                      </button>
                    </div>
                  ) : (
                    <span style={{ fontSize: "0.78rem", color: "var(--color-text-muted)" }}>
                      Asigna un responsable para poder convertirlo en entregable.
                    </span>
                  )}
                </div>
              ))}

              <form className="stack" onSubmit={handleAgregarAcuerdo} style={{ marginTop: 8 }}>
                <h4 style={{ fontSize: "0.85rem", margin: 0 }}>Nuevo acuerdo</h4>
                <input
                  className="input"
                  placeholder="Descripción del acuerdo"
                  value={descripcionAcuerdo}
                  onChange={(e) => setDescripcionAcuerdo(e.target.value)}
                  required
                />
                <select
                  className="input"
                  value={responsableAcuerdo}
                  onChange={(e) => setResponsableAcuerdo(e.target.value)}
                >
                  <option value="">Sin responsable todavía</option>
                  {miembros.map((m) => (
                    <option key={m.usuario_id} value={m.usuario_id}>
                      {m.nombre} ({etiquetaRol(m.rol)})
                    </option>
                  ))}
                </select>
                <button className="btn btn--primary" type="submit" disabled={agregandoAcuerdo} style={{ alignSelf: "flex-start" }}>
                  {agregandoAcuerdo ? "Agregando..." : "Agregar acuerdo"}
                </button>
              </form>

              <div style={{ marginTop: 16, borderTop: "1px solid var(--color-border)", paddingTop: 16 }}>
                <SeccionNotas minutaId={minuta.id} puedeAdministrar={puedeAdministrar} />
              </div>
            </div>
          )}
        </div>
      )}

      {confirmandoEliminarAcuerdo !== null && (
        <ConfirmDialog
          titulo="Eliminar acuerdo"
          mensaje="¿Eliminar este acuerdo?"
          textoConfirmar={eliminandoAcuerdo ? "Eliminando..." : "Eliminar"}
          onConfirmar={confirmarEliminarAcuerdo}
          onCancelar={() => setConfirmandoEliminarAcuerdo(null)}
        />
      )}
    </Modal>
  );
}

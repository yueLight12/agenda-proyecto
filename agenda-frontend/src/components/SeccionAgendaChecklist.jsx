import { useEffect, useState } from "react";
import { proyectosApi, reunionesApi, seriesReunionApi } from "../api/endpoints";

const ETIQUETAS_ESTADO = {
  revisado: "revisado",
  pendiente: "pendiente",
  revisado_con_pendientes: "revisado, con pendientes nuevos",
};

const ITEM_VACIO = {
  seccionId: "",
  texto: "",
  detalle: "",
};

// Formulario de edición inline -- antes se dibujaba UNA sola vez al fondo
// de toda la lista de la junta, desconectado del ítem en el que se hizo
// clic "Editar" (2026-08-18, reportado por Yue como "no funciona el botón
// de editar": sí funcionaba, pero el formulario aparecía lejos, abajo de
// TODOS los temas, fácil de no ver en una agenda larga). Ahora se dibuja
// justo debajo del ítem correspondiente.
function FormularioEditarItem({ item, valores, setValores, arbol, guardando, error, onGuardar, onCancelar }) {
  const mostrarTexto = item.tipo === "pendiente";
  return (
    <form
      className="stack"
      onSubmit={onGuardar}
      style={{
        gap: 6,
        margin: "4px 0 8px",
        padding: 8,
        border: "1px solid var(--color-border)",
        borderRadius: 6,
      }}
    >
      <h4 style={{ fontSize: "0.8rem", margin: 0 }}>Editar: {item.nombre}</h4>

      <select
        className="input"
        value={valores.seccionId}
        onChange={(e) => setValores({ ...valores, seccionId: e.target.value })}
      >
        <option value="">Sin sección (General)</option>
        {arbol.map((p) => (
          <option key={p.id} value={p.id}>
            {p.ruta}
          </option>
        ))}
      </select>

      {mostrarTexto && (
        <input
          className="input"
          placeholder="Describe el pendiente"
          value={valores.texto}
          onChange={(e) => setValores({ ...valores, texto: e.target.value })}
        />
      )}

      <textarea
        className="input"
        rows={2}
        placeholder="Detalle opcional (pegar correo, montos, un link...)"
        value={valores.detalle}
        onChange={(e) => setValores({ ...valores, detalle: e.target.value })}
      />

      {error && <p className="error-text">{error}</p>}

      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn--ghost" type="submit" disabled={guardando} style={{ alignSelf: "flex-start" }}>
          {guardando ? "Guardando..." : "Guardar cambios"}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onCancelar} style={{ alignSelf: "flex-start" }}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

/**
 * Checklist de agenda, compartido entre una junta recurrente (`serieId`) y
 * una reunión suelta (`reunionId`, agregado 2026-08-17 para que ambos
 * tipos de reunión funcionen parecido) -- pasar exactamente uno de los
 * dos. Antes tenía su propio formulario "Agregar punto a la agenda"
 * (tema/entregable/pendiente/nota/acuerdo); se quitó por completo
 * (2026-08-18, a petición de Yue) -- ahora el contenido se auto-siembra
 * solo al marcar temas en el árbol de checkboxes (ver
 * SelectorTemasChecklist / app.services.series_reunion.actualizar_temas),
 * sin agregar nada uno por uno. Lo único que sigue siendo manual aquí es
 * editar el detalle/texto de un ítem ya existente, y reordenar/quitar.
 *
 * Editar/mover/archivar un ítem ya creado usan las mismas rutas de
 * `seriesReunionApi` sin importar el padre (`/series-reuniones/agenda-items/{id}`
 * resuelve el padre server-side por `item.serie_id`/`item.reunion_id`).
 */
export default function SeccionAgendaChecklist({ serieId = null, reunionId = null }) {
  const [agenda, setAgenda] = useState([]);
  const [cargandoAgenda, setCargandoAgenda] = useState(true);
  const [arbol, setArbol] = useState([]); // {id, nombre, ruta} de todo tema/subtema visible
  const [error, setError] = useState("");

  const [itemEditandoId, setItemEditandoId] = useState(null);
  const [item, setItem] = useState(ITEM_VACIO);
  const [guardandoItem, setGuardandoItem] = useState(false);

  const cargarAgenda = async () => {
    setCargandoAgenda(true);
    try {
      const [ag, arbolVisible] = await Promise.all([
        serieId ? seriesReunionApi.agenda(serieId) : reunionesApi.agenda(reunionId),
        proyectosApi.arbolVisible(),
      ]);
      setAgenda(ag);
      setArbol(arbolVisible);
    } catch {
      setError("No se pudo cargar la agenda.");
    } finally {
      setCargandoAgenda(false);
    }
  };

  useEffect(() => {
    cargarAgenda();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serieId, reunionId]);

  const limpiarFormularioItem = () => {
    setItemEditandoId(null);
    setItem(ITEM_VACIO);
  };

  const handleEditarItem = (agendaItem) => {
    setItemEditandoId(agendaItem.id);
    setItem({
      seccionId: agendaItem.seccion_proyecto_id ? String(agendaItem.seccion_proyecto_id) : "",
      texto: agendaItem.tipo === "pendiente" ? agendaItem.nombre : "",
      detalle: agendaItem.detalle || "",
    });
  };

  const handleGuardarItem = async (e) => {
    e.preventDefault();
    if (!itemEditandoId) return;
    setError("");
    setGuardandoItem(true);
    try {
      await seriesReunionApi.editarItemAgenda(itemEditandoId, {
        texto: item.texto || undefined,
        detalle: item.detalle || null,
        seccion_proyecto_id: item.seccionId ? Number(item.seccionId) : null,
      });
      limpiarFormularioItem();
      await cargarAgenda();
    } catch (err) {
      setError(err.response?.data?.detail || "No se pudo guardar el ítem.");
    } finally {
      setGuardandoItem(false);
    }
  };

  const handleQuitarItem = async (itemId) => {
    setError("");
    try {
      await seriesReunionApi.archivarItemAgenda(itemId);
      if (itemEditandoId === itemId) limpiarFormularioItem();
      await cargarAgenda();
    } catch {
      setError("No se pudo quitar el ítem.");
    }
  };

  const handleMoverItem = async (itemId, direccion) => {
    setError("");
    try {
      await seriesReunionApi.moverItemAgenda(itemId, direccion);
      await cargarAgenda();
    } catch {
      setError("No se pudo reordenar el ítem.");
    }
  };

  // Agrupar la agenda por sección (seccion_proyecto_id) -- "General" para
  // los ítems sin sección (junta/reunión general sin agrupar, o un
  // pendiente suelto).
  const grupos = [];
  const indicePorSeccion = {};
  agenda.forEach((it) => {
    const clave = it.seccion_proyecto_id || "general";
    if (!(clave in indicePorSeccion)) {
      indicePorSeccion[clave] = grupos.length;
      grupos.push({ nombre: it.seccion_nombre || "General", items: [] });
    }
    grupos[indicePorSeccion[clave]].items.push(it);
  });

  return (
    <div className="stack" style={{ borderTop: "1px solid var(--color-border)", paddingTop: 12 }}>
      <h3 style={{ fontSize: "0.9rem", margin: 0 }}>Agenda de esta {serieId ? "junta" : "reunión"}</h3>
      <p style={{ color: "var(--color-text-muted)", fontSize: "0.78rem", margin: 0 }}>
        Se llena sola con lo que haya bajo los temas marcados arriba — entregables próximos,
        notas y pendientes. Lo que no se revise sigue pendiente la próxima vez.
      </p>

      {cargandoAgenda && <p style={{ fontSize: "0.85rem" }}>Cargando...</p>}
      {!cargandoAgenda && agenda.length === 0 && (
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
          Todavía no hay ítems en la agenda — marca un tema arriba para traer lo que tenga.
        </p>
      )}

      {grupos.map((grupo) => {
        // El ítem tipo=tema de esta sección (si hay) repite el mismo
        // nombre que el encabezado -- se dobla dentro del encabezado en
        // vez de listarse aparte, para no mostrar "Cubo" seguido de
        // "Cubo — pendiente" (2026-08-18, reportado por Yue).
        const itemTema = grupo.items.find((it) => it.tipo === "tema");
        const itemsListados = grupo.items.filter((it) => it !== itemTema);
        return (
          <div key={grupo.nombre} className="stack" style={{ gap: 4 }}>
            <div className="list-inline" style={{ padding: "2px 0", alignItems: "flex-start" }}>
              <h4 style={{ fontSize: "0.82rem", margin: "6px 0 0", color: "var(--color-text-muted)" }}>
                {grupo.nombre}
                {itemTema && (
                  <span style={{ fontWeight: 400 }}>
                    {" "}— {ETIQUETAS_ESTADO[itemTema.estado_actual] || itemTema.estado_actual}
                  </span>
                )}
              </h4>
              {itemTema && (
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    style={{ fontSize: "0.72rem", padding: "2px 6px" }}
                    onClick={() => handleEditarItem(itemTema)}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    style={{ fontSize: "0.72rem", padding: "2px 6px" }}
                    onClick={() => handleQuitarItem(itemTema.id)}
                  >
                    Quitar
                  </button>
                </div>
              )}
            </div>
            {itemEditandoId === itemTema?.id && (
              <FormularioEditarItem
                item={itemTema}
                valores={item}
                setValores={setItem}
                arbol={arbol}
                guardando={guardandoItem}
                error={error}
                onGuardar={handleGuardarItem}
                onCancelar={limpiarFormularioItem}
              />
            )}
          {itemsListados.map((it, idx) => (
            <div key={it.id} className="stack" style={{ gap: 0 }}>
              <div className="list-inline" style={{ padding: "4px 0", alignItems: "flex-start" }}>
                <div>
                  <span style={{ fontSize: "0.85rem" }}>
                    {it.nombre}{" "}
                    <span style={{ color: "var(--color-text-muted)", fontSize: "0.78rem" }}>
                      — {ETIQUETAS_ESTADO[it.estado_actual] || it.estado_actual}
                    </span>
                  </span>
                  {it.detalle && (
                    <p style={{ margin: "2px 0 0", fontSize: "0.78rem", color: "var(--color-text-muted)" }}>
                      {it.detalle}
                    </p>
                  )}
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    style={{ fontSize: "0.72rem", padding: "2px 6px" }}
                    onClick={() => handleMoverItem(it.id, "arriba")}
                    disabled={idx === 0}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    style={{ fontSize: "0.72rem", padding: "2px 6px" }}
                    onClick={() => handleMoverItem(it.id, "abajo")}
                    disabled={idx === itemsListados.length - 1}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    style={{ fontSize: "0.72rem", padding: "2px 6px" }}
                    onClick={() => handleEditarItem(it)}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    style={{ fontSize: "0.72rem", padding: "2px 6px" }}
                    onClick={() => handleQuitarItem(it.id)}
                  >
                    Quitar
                  </button>
                </div>
              </div>
              {itemEditandoId === it.id && (
                <FormularioEditarItem
                  item={it}
                  valores={item}
                  setValores={setItem}
                  arbol={arbol}
                  guardando={guardandoItem}
                  error={error}
                  onGuardar={handleGuardarItem}
                  onCancelar={limpiarFormularioItem}
                />
              )}
            </div>
          ))}
          </div>
        );
      })}

      {error && !itemEditandoId && <p className="error-text">{error}</p>}
    </div>
  );
}

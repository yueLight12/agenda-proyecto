import { useEffect, useState } from "react";
import {
  acuerdosApi,
  entregablesApi,
  notasApi,
  pendientesApi,
  proyectosApi,
  reunionesApi,
  seriesReunionApi,
} from "../api/endpoints";

const ETIQUETAS_ESTADO = {
  revisado: "revisado",
  pendiente: "pendiente",
  revisado_con_pendientes: "revisado, con pendientes nuevos",
};

const TIPOS_ITEM = [
  { value: "pendiente", label: "Pendiente" },
  { value: "tema", label: "Tema/subtema" },
  { value: "entregable", label: "Entregable" },
  { value: "nota", label: "Nota" },
  { value: "acuerdo", label: "Acuerdo" },
];

const ITEM_VACIO = {
  tipo: "pendiente",
  seccionId: "",
  texto: "",
  detalle: "",
  entregableId: "",
  notaId: "",
  notaContenido: "",
  pendienteId: "",
  pendienteContenido: "",
  acuerdoId: "",
};

/**
 * Checklist de agenda ("Agregar punto": tema/subtema, entregable,
 * pendiente, nota, acuerdo), compartido entre una junta recurrente
 * (`serieId`) y una reunión suelta (`reunionId`, agregado 2026-08-17 para
 * que ambos tipos de reunión funcionen parecido, a petición de Yue) --
 * pasar exactamente uno de los dos. Antes vivía inline solo en
 * `ModalSerieReunion.jsx`; se extrajo aquí para no duplicar ~250 líneas al
 * sumar reuniones sueltas.
 *
 * Editar/mover/archivar un ítem ya creado usan las mismas rutas de
 * `seriesReunionApi` sin importar el padre (`/series-reuniones/agenda-items/{id}`
 * resuelve el padre server-side por `item.serie_id`/`item.reunion_id`) --
 * solo cargar la lista y agregar un ítem nuevo distinguen entre serie y
 * reunión.
 */
export default function SeccionAgendaChecklist({ serieId = null, reunionId = null }) {
  const [agenda, setAgenda] = useState([]);
  const [cargandoAgenda, setCargandoAgenda] = useState(true);
  const [arbol, setArbol] = useState([]); // {id, nombre, ruta} de todo tema/subtema visible
  const [error, setError] = useState("");

  const [itemEditandoId, setItemEditandoId] = useState(null); // null = "agregar", id = "editar"
  const [item, setItem] = useState(ITEM_VACIO);
  const [entregablesSeccion, setEntregablesSeccion] = useState([]);
  const [notasSeccion, setNotasSeccion] = useState([]);
  const [pendientesSeccion, setPendientesSeccion] = useState([]);
  const [acuerdosSeccion, setAcuerdosSeccion] = useState([]);
  const [agregandoItem, setAgregandoItem] = useState(false);

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

  // Cuando el tipo es "entregable"/"nota"/"pendiente"/"acuerdo", cargar las
  // opciones de esa sección bajo demanda (solo cuando ya se eligió a cuál
  // tema/subtema).
  useEffect(() => {
    if (item.tipo === "entregable" && item.seccionId) {
      entregablesApi.listarPorProyecto(Number(item.seccionId)).then(setEntregablesSeccion).catch(() => setEntregablesSeccion([]));
    } else {
      setEntregablesSeccion([]);
    }
    if (item.tipo === "nota" && item.seccionId) {
      notasApi.listar({ proyecto_id: Number(item.seccionId) }).then(setNotasSeccion).catch(() => setNotasSeccion([]));
    } else {
      setNotasSeccion([]);
    }
    if (item.tipo === "pendiente" && item.seccionId) {
      pendientesApi
        .listar({ proyecto_id: Number(item.seccionId) })
        .then(setPendientesSeccion)
        .catch(() => setPendientesSeccion([]));
    } else {
      setPendientesSeccion([]);
    }
    if (item.tipo === "acuerdo" && item.seccionId) {
      acuerdosApi
        .listarPorProyecto(Number(item.seccionId))
        .then(setAcuerdosSeccion)
        .catch(() => setAcuerdosSeccion([]));
    } else {
      setAcuerdosSeccion([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.tipo, item.seccionId]);

  const limpiarFormularioItem = () => {
    setItemEditandoId(null);
    setItem(ITEM_VACIO);
  };

  const handleEditarItem = (agendaItem) => {
    setItemEditandoId(agendaItem.id);
    setItem({
      tipo: agendaItem.tipo,
      seccionId: agendaItem.seccion_proyecto_id ? String(agendaItem.seccion_proyecto_id) : "",
      texto: agendaItem.tipo === "pendiente" ? agendaItem.nombre : "",
      detalle: agendaItem.detalle || "",
      entregableId: "",
      notaId: "",
      notaContenido: "",
      pendienteId: "",
      pendienteContenido: "",
      acuerdoId: "",
    });
  };

  const handleGuardarItem = async (e) => {
    e.preventDefault();
    setError("");

    if (!itemEditandoId) {
      if (item.tipo === "tema" && !item.seccionId) {
        setError("Elige el tema/subtema que quieres agregar.");
        return;
      }
      if (item.tipo === "entregable" && !item.entregableId) {
        setError(item.seccionId ? "Elige un entregable de la lista." : "Elige primero una sección.");
        return;
      }
      if (item.tipo === "acuerdo" && !item.acuerdoId) {
        setError(item.seccionId ? "Elige un acuerdo de la lista." : "Elige primero una sección.");
        return;
      }
    }

    setAgregandoItem(true);
    try {
      if (itemEditandoId) {
        await seriesReunionApi.editarItemAgenda(itemEditandoId, {
          texto: item.tipo === "pendiente" ? item.texto : undefined,
          detalle: item.detalle || null,
          seccion_proyecto_id: item.seccionId ? Number(item.seccionId) : null,
        });
      } else {
        const datos = { tipo: item.tipo, detalle: item.detalle || null };
        if (item.tipo === "tema") {
          datos.proyecto_id = Number(item.seccionId);
          datos.seccion_proyecto_id = Number(item.seccionId);
        } else {
          datos.seccion_proyecto_id = item.seccionId ? Number(item.seccionId) : null;
          if (item.tipo === "pendiente") {
            if (item.pendienteId) datos.pendiente_id = Number(item.pendienteId);
            else datos.pendiente_contenido = item.pendienteContenido;
          }
          if (item.tipo === "entregable") datos.entregable_id = Number(item.entregableId);
          if (item.tipo === "nota") {
            if (item.notaId) datos.nota_id = Number(item.notaId);
            else datos.nota_contenido = item.notaContenido;
          }
          if (item.tipo === "acuerdo") datos.acuerdo_id = Number(item.acuerdoId);
        }
        if (serieId) await seriesReunionApi.agregarItemAgenda(serieId, datos);
        else await reunionesApi.agregarItemAgenda(reunionId, datos);
      }
      limpiarFormularioItem();
      await cargarAgenda();
    } catch (err) {
      setError(err.response?.data?.detail || "No se pudo guardar el ítem.");
    } finally {
      setAgregandoItem(false);
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
        {serieId
          ? "Lo que agregues aquí se revisa en cada ocurrencia — lo que no se revise sigue pendiente la próxima vez. Los puntos se agrupan por tema."
          : "Temas, entregables, pendientes, notas y acuerdos que quieras dejar listos para esta reunión, agrupados por tema."}
      </p>

      {cargandoAgenda && <p style={{ fontSize: "0.85rem" }}>Cargando...</p>}
      {!cargandoAgenda && agenda.length === 0 && (
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
          Todavía no hay ítems en la agenda.
        </p>
      )}

      {grupos.map((grupo) => (
        <div key={grupo.nombre} className="stack" style={{ gap: 4 }}>
          <h4 style={{ fontSize: "0.82rem", margin: "6px 0 0", color: "var(--color-text-muted)" }}>
            {grupo.nombre}
          </h4>
          {grupo.items.map((it, idx) => (
            <div key={it.id} className="list-inline" style={{ padding: "4px 0", alignItems: "flex-start" }}>
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
                  disabled={idx === grupo.items.length - 1}
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
          ))}
        </div>
      ))}

      <form className="stack" onSubmit={handleGuardarItem} style={{ gap: 6, marginTop: 8 }}>
        <h4 style={{ fontSize: "0.85rem", margin: 0 }}>
          {itemEditandoId ? "Editar punto" : "Agregar punto a la agenda"}
        </h4>

        {!itemEditandoId && (
          <select
            className="input"
            value={item.tipo}
            onChange={(e) => setItem({ ...ITEM_VACIO, tipo: e.target.value })}
          >
            {TIPOS_ITEM.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        )}

        <select
          className="input"
          value={item.seccionId}
          onChange={(e) => setItem({ ...item, seccionId: e.target.value })}
          required={item.tipo === "tema"}
        >
          <option value="">
            {item.tipo === "tema" ? "Selecciona el tema/subtema" : "Sin sección (General)"}
          </option>
          {arbol.map((p) => (
            <option key={p.id} value={p.id}>
              {p.ruta}
            </option>
          ))}
        </select>
        {!item.seccionId && ["entregable", "acuerdo", "nota"].includes(item.tipo) && !itemEditandoId && (
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.75rem", margin: 0 }}>
            Elige una sección (tema/subtema) arriba para poder elegir{" "}
            {item.tipo === "entregable" ? "un entregable" : item.tipo === "acuerdo" ? "un acuerdo" : "una nota"}.
          </p>
        )}

        {item.tipo === "pendiente" && !itemEditandoId && (
          <>
            <select
              className="input"
              value={item.pendienteId}
              onChange={(e) => setItem({ ...item, pendienteId: e.target.value, pendienteContenido: "" })}
              disabled={!item.seccionId}
            >
              <option value="">
                {!item.seccionId
                  ? "Elige primero una sección"
                  : "Escribir un pendiente nuevo (abajo) o elegir uno existente"}
              </option>
              {pendientesSeccion.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.contenido.slice(0, 60)}
                </option>
              ))}
            </select>
            {!item.pendienteId && (
              <textarea
                className="input"
                rows={2}
                placeholder={
                  item.seccionId
                    ? "O escribe un pendiente nuevo sobre este tema..."
                    : "Describe el pendiente (sin tema, no se guarda para reutilizar después)..."
                }
                value={item.pendienteContenido}
                onChange={(e) => setItem({ ...item, pendienteContenido: e.target.value })}
                required={!item.pendienteId}
              />
            )}
          </>
        )}

        {item.tipo === "pendiente" && itemEditandoId && (
          <input
            className="input"
            placeholder="Describe el pendiente"
            value={item.texto}
            onChange={(e) => setItem({ ...item, texto: e.target.value })}
            required
          />
        )}

        {item.tipo === "entregable" && !itemEditandoId && (
          <select
            className="input"
            value={item.entregableId}
            onChange={(e) => setItem({ ...item, entregableId: e.target.value })}
            required
            disabled={!item.seccionId}
          >
            <option value="" disabled>
              {!item.seccionId
                ? "Elige primero una sección"
                : entregablesSeccion.length === 0
                ? "Esta sección no tiene entregables"
                : "Selecciona un entregable"}
            </option>
            {entregablesSeccion.map((en) => (
              <option key={en.id} value={en.id}>
                {en.nombre}
              </option>
            ))}
          </select>
        )}

        {item.tipo === "acuerdo" && !itemEditandoId && (
          <select
            className="input"
            value={item.acuerdoId}
            onChange={(e) => setItem({ ...item, acuerdoId: e.target.value })}
            required
            disabled={!item.seccionId}
          >
            <option value="" disabled>
              {!item.seccionId
                ? "Elige primero una sección"
                : acuerdosSeccion.length === 0
                ? "Esta sección no tiene acuerdos"
                : "Selecciona un acuerdo"}
            </option>
            {acuerdosSeccion.map((a) => (
              <option key={a.id} value={a.id}>
                {a.descripcion.slice(0, 60)}
                {a.responsable_nombre ? ` — ${a.responsable_nombre}` : ""}
              </option>
            ))}
          </select>
        )}

        {item.tipo === "nota" && !itemEditandoId && (
          <>
            <select
              className="input"
              value={item.notaId}
              onChange={(e) => setItem({ ...item, notaId: e.target.value, notaContenido: "" })}
              disabled={!item.seccionId}
            >
              <option value="">
                {!item.seccionId
                  ? "Elige primero una sección"
                  : "Escribir una nota nueva (abajo) o elegir una existente"}
              </option>
              {notasSeccion.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.contenido.slice(0, 60)}
                </option>
              ))}
            </select>
            {!item.notaId && (
              <textarea
                className="input"
                rows={2}
                placeholder="O escribe una nota nueva sobre este tema..."
                value={item.notaContenido}
                onChange={(e) => setItem({ ...item, notaContenido: e.target.value })}
                disabled={!item.seccionId}
                required={!item.notaId}
              />
            )}
          </>
        )}

        <textarea
          className="input"
          rows={2}
          placeholder="Detalle opcional (pegar correo, montos, un link...)"
          value={item.detalle}
          onChange={(e) => setItem({ ...item, detalle: e.target.value })}
        />

        {error && <p className="error-text">{error}</p>}

        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="btn btn--ghost"
            type="submit"
            disabled={agregandoItem}
            style={{ alignSelf: "flex-start" }}
          >
            {agregandoItem ? "Guardando..." : itemEditandoId ? "Guardar cambios" : "Agregar a la agenda"}
          </button>
          {itemEditandoId && (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={limpiarFormularioItem}
              style={{ alignSelf: "flex-start" }}
            >
              Cancelar
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

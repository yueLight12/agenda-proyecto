import { useState } from "react";
import Modal from "../Modal";
import { miEquipoApi } from "../../api/endpoints";
import { colorAvatar, iniciales } from "../../utils/avatarPersona";

// Primer paso de la tarjeta "Persona" en Agenda Plan B (2026-08-20, a
// petición de Yue: "sería parecido a Tarea, en el de persona será para
// asignar tareas/entregables a esa persona") -- elegir primero de la lista
// de tu equipo, y con eso AgendaPlanB.jsx abre ModalAsignarTareaRapida ya
// con `personaInicialId` fijo, saltando directo al paso de elegir tema.
//
// Buscador + avatares con iniciales (2026-08-21, diseño "grafito", a
// partir de una referencia tipo "Team Directory") -- el buscador filtra de
// verdad (útil para equipos grandes, funciona en los 4 estilos, no solo
// visual); los avatares son iniciales con color por persona porque el
// sistema no tiene fotos de perfil, sin inventar un "punto de estado en
// línea" que no existe como dato real.
//
// Despliegue anidado (2026-08-25, a petición de Yue: caso real de Bernardo
// con Diana/David -- gente como Lucy/Grecia reporta a Diana, no directo a
// Bernardo, pero Bernardo quiere poder verla y asignarle sin tenerla
// duplicada suelta en su propia lista) -- cada fila tiene un botón "▸" que
// pide GET /mi-equipo/{id}/equipo (ver listar_equipo_de_subordinado en el
// backend, solo permite un nivel: el equipo de alguien que sea TU reporte
// directo). Se cachea por usuario_id para no repetir la llamada si se
// colapsa y se vuelve a abrir. Cualquier persona, anidada o no, se elige
// igual con el botón "Elegir" -- el despliegue es solo para encontrarla,
// no cambia el flujo de selección.
export default function SelectorPersona({ equipo, error, onElegir, onCerrar }) {
  const [busqueda, setBusqueda] = useState("");
  const [expandidos, setExpandidos] = useState({});
  const [subequipos, setSubequipos] = useState({});
  const [cargandoSub, setCargandoSub] = useState({});

  const equipoFiltrado = equipo.filter((m) =>
    m.nombre.toLowerCase().includes(busqueda.trim().toLowerCase())
  );

  const alternarExpandir = async (usuarioId) => {
    setExpandidos((prev) => ({ ...prev, [usuarioId]: !prev[usuarioId] }));
    if (subequipos[usuarioId] || cargandoSub[usuarioId]) return;
    setCargandoSub((prev) => ({ ...prev, [usuarioId]: true }));
    try {
      const data = await miEquipoApi.listarDe(usuarioId);
      setSubequipos((prev) => ({ ...prev, [usuarioId]: data }));
    } catch {
      setSubequipos((prev) => ({ ...prev, [usuarioId]: [] }));
    } finally {
      setCargandoSub((prev) => ({ ...prev, [usuarioId]: false }));
    }
  };

  const filaPersona = (m, { anidado = false } = {}) => (
    <div key={m.usuario_id} className={anidado ? "planb__persona-fila-anidada" : undefined}>
      <div className="planb__persona-fila-wrap">
        <button
          type="button"
          className="planb__persona-fila"
          onClick={() => onElegir(m)}
        >
          <span
            className="planb__persona-avatar"
            style={{ background: colorAvatar(m.nombre) }}
            aria-hidden="true"
          >
            {iniciales(m.nombre)}
          </span>
          <span className="planb__persona-datos">
            <span className="planb__persona-nombre">{m.nombre}</span>
            {m.puesto && <span className="planb__persona-puesto">{m.puesto}</span>}
          </span>
          <span className="planb__persona-elegir" aria-hidden="true">
            Elegir
          </span>
        </button>
        {!anidado && (
          <button
            type="button"
            className="planb__persona-expandir"
            onClick={() => alternarExpandir(m.usuario_id)}
            aria-label={
              expandidos[m.usuario_id] ? `Ocultar equipo de ${m.nombre}` : `Ver equipo de ${m.nombre}`
            }
            aria-expanded={Boolean(expandidos[m.usuario_id])}
          >
            {expandidos[m.usuario_id] ? "▾" : "▸"}
          </button>
        )}
      </div>
      {!anidado && expandidos[m.usuario_id] && (
        <div className="planb__persona-subequipo">
          {cargandoSub[m.usuario_id] && (
            <p style={{ color: "var(--color-text-muted)", fontSize: "0.8rem" }}>Cargando...</p>
          )}
          {!cargandoSub[m.usuario_id] && (subequipos[m.usuario_id] || []).length === 0 && (
            <p style={{ color: "var(--color-text-muted)", fontSize: "0.8rem" }}>
              {m.nombre.split(" ")[0]} no tiene equipo propio todavía.
            </p>
          )}
          {!cargandoSub[m.usuario_id] &&
            (subequipos[m.usuario_id] || []).map((sub) => filaPersona(sub, { anidado: true }))}
        </div>
      )}
    </div>
  );

  return (
    <Modal titulo="¿A quién le quieres asignar una tarea?" onCerrar={onCerrar}>
      <div className="stack">
        {error && <p className="error-text">{error}</p>}
        {!error && equipo.length === 0 && (
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
            No tienes personas en tu equipo todavía.
          </p>
        )}
        {!error && equipo.length > 0 && (
          <input
            className="input"
            type="search"
            placeholder="Buscar en tu equipo..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            aria-label="Buscar en tu equipo"
          />
        )}
        {!error && equipo.length > 0 && equipoFiltrado.length === 0 && (
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
            Nadie coincide con "{busqueda}".
          </p>
        )}
        {equipoFiltrado.map((m) => filaPersona(m))}
      </div>
    </Modal>
  );
}

import { useEffect, useState } from "react";
import { miEquipoApi, usuariosApi } from "../api/endpoints";
import ResumenEquipo from "../components/ResumenEquipo";
import { ROL_LABELS, etiquetaRol } from "../utils/rolLabels";

const ROLES = ["N1", "N2", "N3", "N4"];

export default function Equipo() {
  const [tab, setTab] = useState("resumen"); // "resumen" | "plantilla"

  return (
    <div className="stack">
      <div className="topbar">
        <h1>Equipo</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            className={`btn ${tab === "resumen" ? "btn--primary" : "btn--ghost"}`}
            type="button"
            onClick={() => setTab("resumen")}
          >
            Resumen de mi equipo
          </button>
          <button
            className={`btn ${tab === "plantilla" ? "btn--primary" : "btn--ghost"}`}
            type="button"
            onClick={() => setTab("plantilla")}
          >
            Plantilla (Mi equipo)
          </button>
        </div>
      </div>

      {tab === "resumen" ? <ResumenEquipo /> : <PlantillaEquipo />}
    </div>
  );
}

function PlantillaEquipo() {
  const [miEquipo, setMiEquipo] = useState([]);
  const [usuariosDisponibles, setUsuariosDisponibles] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [errorListaUsuarios, setErrorListaUsuarios] = useState("");

  const [usuarioId, setUsuarioId] = useState("");
  const [rol, setRol] = useState("N3");
  const [guardando, setGuardando] = useState(false);
  const [errorAgregar, setErrorAgregar] = useState("");

  const cargar = () =>
    Promise.all([
      miEquipoApi.listar(),
      usuariosApi.listar().catch(() => {
        setErrorListaUsuarios("No se pudo cargar el listado de usuarios.");
        return [];
      }),
    ])
      .then(([equipo, usuarios]) => {
        setMiEquipo(equipo);
        setUsuariosDisponibles(usuarios);
      })
      .catch(() => setError("No se pudo cargar tu equipo. Intenta de nuevo más tarde."))
      .finally(() => setCargando(false));

  useEffect(() => {
    cargar();
  }, []);

  const handleAgregar = async (e) => {
    e.preventDefault();
    setErrorAgregar("");
    setGuardando(true);
    try {
      await miEquipoApi.agregar({ usuario_id: Number(usuarioId), rol });
      setUsuarioId("");
      setRol("N3");
      await cargar();
    } catch (err) {
      setErrorAgregar(err.response?.data?.detail || "No se pudo agregar a tu equipo.");
    } finally {
      setGuardando(false);
    }
  };

  const handleQuitar = async (usuarioIdAQuitar) => {
    if (!window.confirm("¿Quitar a esta persona de tu equipo guardado?")) return;
    await miEquipoApi.quitar(usuarioIdAQuitar);
    await cargar();
  };

  if (cargando) return <p>Cargando tu equipo...</p>;
  if (error) return <p className="error-text">{error}</p>;

  return (
    <div className="stack">
      <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
        Guarda aquí a las personas que siempre trabajan contigo (ej. "el equipo de David") para
        aplicarlas de un clic a cualquier proyecto, en vez de asignarlas una por una cada vez.
        Desde "Administrar equipo" dentro de un proyecto vas a poder usar el botón
        "Aplicar mi equipo".
      </p>

      <div className="card">
        {miEquipo.length === 0 && (
          <p style={{ color: "var(--color-text-muted)" }}>
            Todavía no has guardado a nadie en tu equipo.
          </p>
        )}
        {miEquipo.map((m) => (
          <div className="list-inline" key={m.usuario_id}>
            <div>
              <strong>{m.nombre}</strong>{" "}
              {m.puesto && (
                <span style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
                  ({m.puesto})
                </span>
              )}{" "}
              <span style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
                {m.email} — {etiquetaRol(m.rol)}
              </span>
            </div>
            <button className="btn btn--ghost" type="button" onClick={() => handleQuitar(m.usuario_id)}>
              Quitar
            </button>
          </div>
        ))}
      </div>

      <form className="stack card" onSubmit={handleAgregar} style={{ maxWidth: 420 }}>
        <h3 style={{ fontSize: "0.95rem", margin: 0 }}>Agregar persona a mi equipo</h3>
        {errorListaUsuarios && <p className="error-text">{errorListaUsuarios}</p>}
        <label className="stack" style={{ gap: 4 }}>
          <span style={{ fontSize: "0.85rem" }}>Usuario</span>
          <select
            className="input"
            value={usuarioId}
            onChange={(e) => setUsuarioId(e.target.value)}
            required
            disabled={usuariosDisponibles.length === 0}
          >
            <option value="" disabled>
              Selecciona un usuario
            </option>
            {usuariosDisponibles.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
                {u.puesto ? ` — ${u.puesto}` : ""} ({u.email})
              </option>
            ))}
          </select>
        </label>
        <label className="stack" style={{ gap: 4 }}>
          <span style={{ fontSize: "0.85rem" }}>Rol por default al aplicar la plantilla</span>
          <select className="input" value={rol} onChange={(e) => setRol(e.target.value)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROL_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        {errorAgregar && <p className="error-text">{errorAgregar}</p>}
        <button className="btn btn--primary" type="submit" disabled={guardando}>
          {guardando ? "Guardando..." : "Agregar a mi equipo"}
        </button>
      </form>
    </div>
  );
}

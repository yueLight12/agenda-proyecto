import { useEffect, useState } from "react";
import { equipoResumenApi, proyectosApi } from "../api/endpoints";
import { useAuth } from "../context/AuthContext";
import EstatusBadge from "./EstatusBadge";
import ModalEquipo from "./ModalEquipo";

export default function ResumenEquipo() {
  const { usuario } = useAuth();
  const [miembros, setMiembros] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [modalProyecto, setModalProyecto] = useState(null); // { id, nombre } | null
  const [miembrosModal, setMiembrosModal] = useState([]);
  const [personaExpandidaId, setPersonaExpandidaId] = useState(null);
  const [proyectoExpandidoId, setProyectoExpandidoId] = useState(null);

  const togglePersona = (usuarioId) => {
    setPersonaExpandidaId((actual) => (actual === usuarioId ? null : usuarioId));
    setProyectoExpandidoId(null);
  };

  const toggleProyecto = (proyectoId) => {
    setProyectoExpandidoId((actual) => (actual === proyectoId ? null : proyectoId));
  };

  const cargar = () =>
    equipoResumenApi
      .resumen()
      .then((data) => setMiembros(data.miembros))
      .catch(() => setError("No se pudo cargar el resumen de tu equipo. Intenta de nuevo más tarde."))
      .finally(() => setCargando(false));

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rol del usuario QUE ESTÁ VIENDO la pantalla en ese proyecto (no el rol
  // de la persona que se está mostrando) — mismo patrón que
  // TableroProyecto.jsx usa para decidir quién puede administrar.
  const rolDelViewerEnProyecto = (proyectoId) =>
    usuario?.es_super_admin
      ? "N1"
      : usuario?.roles_por_proyecto.find((r) => r.proyecto_id === proyectoId)?.rol;
  const puedeAdministrar = (proyectoId) => ["N1", "N2"].includes(rolDelViewerEnProyecto(proyectoId));

  const abrirAdministrar = async (proyectoId, proyectoNombre) => {
    const equipo = await proyectosApi.equipo(proyectoId);
    setMiembrosModal(equipo);
    setModalProyecto({ id: proyectoId, nombre: proyectoNombre });
  };

  const refrescarModal = async () => {
    const fresco = await proyectosApi.equipo(modalProyecto.id);
    setMiembrosModal(fresco);
    await cargar();
  };

  if (cargando) return <p>Cargando resumen de tu equipo...</p>;
  if (error) return <p className="error-text">{error}</p>;

  return (
    <div className="stack">
      <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
        Las reuniones que se muestran aquí son solo las que tú también puedes ver (donde tú
        organizas o estás invitado) — no necesariamente todas las reuniones de cada persona.
      </p>

      {miembros.length === 0 && <p>No tienes equipo visible en ningún proyecto todavía.</p>}

      {miembros.map((m) => {
        const hoyIso = new Date().toISOString().slice(0, 10);
        const totalVencidos = m.proyectos.reduce(
          (acc, p) =>
            acc + p.entregables.filter((e) => e.estatus !== "cumplido" && e.fecha_entrega < hoyIso).length,
          0
        );
        const expandida = personaExpandidaId === m.usuario_id;
        return (
        <div className="card" key={m.usuario_id}>
          <button
            type="button"
            className="list-inline list-inline--boton"
            style={{ flexWrap: "wrap", gap: 4 }}
            onClick={() => togglePersona(m.usuario_id)}
            aria-expanded={expandida}
          >
            <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
              <strong>{m.nombre}</strong>
              <span style={{ color: "var(--color-text-muted)", fontSize: "0.85rem", wordBreak: "break-all" }}>
                {m.email}
              </span>
            </span>
            <span style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
              {m.proyectos.length} proyecto{m.proyectos.length === 1 ? "" : "s"}
              {totalVencidos > 0 && ` · ${totalVencidos} vencido${totalVencidos === 1 ? "" : "s"}`}
              {" "}{expandida ? "▲" : "▼"}
            </span>
          </button>

          {expandida && m.proyectos.map((p) => {
            const proyectoVencidos = p.entregables.filter(
              (e) => e.estatus !== "cumplido" && e.fecha_entrega < hoyIso
            ).length;
            const proyectoExpandido = proyectoExpandidoId === p.proyecto_id;
            return (
            <div key={p.proyecto_id} style={{ padding: "6px 0 6px 12px" }}>
              <div className="list-inline" style={{ padding: "4px 0", flexWrap: "wrap", gap: 8 }}>
                <button
                  type="button"
                  className="boton-desplegar"
                  onClick={() => toggleProyecto(p.proyecto_id)}
                  aria-expanded={proyectoExpandido}
                >
                  <strong>{p.proyecto_nombre}</strong>{" "}
                  <span style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
                    ({p.rol}) · {p.entregables.length} entregable{p.entregables.length === 1 ? "" : "s"}
                    {proyectoVencidos > 0 &&
                      ` · ${proyectoVencidos} vencido${proyectoVencidos === 1 ? "" : "s"}`}
                    {" "}{proyectoExpandido ? "▲" : "▼"}
                  </span>
                </button>
                {puedeAdministrar(p.proyecto_id) && (
                  <button
                    className="btn btn--ghost"
                    type="button"
                    onClick={() => abrirAdministrar(p.proyecto_id, p.proyecto_nombre)}
                  >
                    Administrar
                  </button>
                )}
              </div>

              {proyectoExpandido && (
                <>
                  {p.entregables.length === 0 && (
                    <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem", padding: "4px 0 4px 12px" }}>
                      Sin entregables en este proyecto.
                    </p>
                  )}
                  {p.entregables.map((e) => (
                    <div key={e.id} className="list-inline" style={{ padding: "4px 0 4px 12px" }}>
                      <div style={{ flex: 1, marginRight: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span>
                            {e.nombre}
                            {e.sensible && (
                              <span className="badge badge--sensible" style={{ marginLeft: 8 }}>
                                Sensible
                              </span>
                            )}
                          </span>
                          <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                            {e.porcentaje_avance}%
                          </span>
                        </div>
                        <div className="progress-bar">
                          <div className="progress-bar__fill" style={{ width: `${e.porcentaje_avance}%` }} />
                        </div>
                      </div>
                      <EstatusBadge estatus={e.estatus} />
                    </div>
                  ))}

                  {p.reuniones.map((r) => (
                <div key={r.id} className="list-inline" style={{ padding: "4px 0 4px 12px" }}>
                  <span>{r.titulo}</span>
                  <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                    {new Date(r.fecha_inicio).toLocaleString("es-MX", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}{" "}
                    — {r.rol_en_reunion}
                  </span>
                </div>
                  ))}
                </>
              )}
            </div>
            );
          })}
        </div>
        );
      })}

      {modalProyecto && (
        <ModalEquipo
          proyectoId={modalProyecto.id}
          miembros={miembrosModal}
          onCambio={refrescarModal}
          onCerrar={() => setModalProyecto(null)}
        />
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { adminApi } from "../api/endpoints";
import Modal from "../components/Modal";
import PageHeader from "../components/PageHeader";

const ROLES = ["N1", "N2", "N3", "N4"];

// Modal único para las 3 acciones de edición (2026-09-17): agregar a
// alguien al equipo de un jefe, mover a alguien de un jefe a otro, o
// asignarle un jefe a alguien que no tenía ninguno -- las tres son la
// misma operación de fondo (POST /admin/organigrama/asignar), solo cambia
// si además hay que quitar la relación vieja primero.
function ModalAsignar({ titulo, personaNombre, usuarios, jefeActualId, onGuardar, onCerrar, error, guardando }) {
  const opciones = usuarios.filter((u) => u.id !== jefeActualId);
  const [jefeId, setJefeId] = useState(opciones[0]?.id || "");
  const [rol, setRol] = useState("N3");

  return (
    <Modal titulo={titulo} onCerrar={onCerrar}>
      <div className="stack">
        <p style={{ fontSize: "0.9rem", color: "var(--color-text-muted)" }}>
          Persona: <strong>{personaNombre}</strong>
        </p>
        <label className="stack" style={{ gap: 4 }}>
          <span style={{ fontSize: "0.85rem" }}>Nuevo jefe</span>
          <select className="input" value={jefeId} onChange={(e) => setJefeId(e.target.value)}>
            {opciones.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
                {!u.activo ? " (inactivo)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="stack" style={{ gap: 4 }}>
          <span style={{ fontSize: "0.85rem" }}>Rol default</span>
          <select className="input" value={rol} onChange={(e) => setRol(e.target.value)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="error-text">{error}</p>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="btn btn--ghost" onClick={onCerrar}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={guardando || !jefeId}
            onClick={() => onGuardar(Number(jefeId), rol)}
          >
            {guardando ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Un nodo del árbol + sus hijos, recursivo (2026-09-17). `ruta` protege
// contra ciclos (si A quedara como jefe de B y B como jefe de A por un
// dato mal cargado) -- no debería pasar nunca en datos reales, pero es
// gratis blindarlo.
function NodoOrganigrama({ nodo, relaciones, jefeIdDeEsteNodo, ruta, onMover, onQuitar, onAgregar }) {
  const [colapsado, setColapsado] = useState(false);
  const hijos = relaciones.filter((r) => r.jefe_id === nodo.id);
  const esCiclo = ruta.has(nodo.id);

  return (
    <li>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "4px 0",
        }}
      >
        {hijos.length > 0 && !esCiclo && (
          <button
            type="button"
            className="btn btn--ghost"
            style={{ padding: "0 6px" }}
            onClick={() => setColapsado((c) => !c)}
          >
            {colapsado ? "▸" : "▾"}
          </button>
        )}
        <span style={{ fontWeight: jefeIdDeEsteNodo == null ? 700 : 400 }}>
          {nodo.nombre}
          {!nodo.activo ? " (inactivo)" : ""}
        </span>
        {esCiclo && (
          <span style={{ color: "var(--color-error, #c0392b)", fontSize: "0.75rem" }}>
            (ciclo detectado, no se expande)
          </span>
        )}
        <div style={{ display: "flex", gap: 4, marginLeft: 8 }}>
          <button type="button" className="btn btn--ghost" onClick={() => onAgregar(nodo)}>
            + Agregar a su equipo
          </button>
          {jefeIdDeEsteNodo != null && (
            <>
              <button type="button" className="btn btn--ghost" onClick={() => onMover(nodo, jefeIdDeEsteNodo)}>
                Mover
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => onQuitar(nodo, jefeIdDeEsteNodo)}
              >
                Quitar
              </button>
            </>
          )}
        </div>
      </div>
      {hijos.length > 0 && !esCiclo && !colapsado && (
        <ul style={{ listStyle: "none", paddingLeft: 24, margin: 0 }}>
          {hijos.map((h) => (
            <NodoOrganigrama
              key={`${nodo.id}-${h.usuario_id}`}
              nodo={{ id: h.usuario_id, nombre: h.usuario_nombre, activo: true }}
              relaciones={relaciones}
              jefeIdDeEsteNodo={nodo.id}
              ruta={new Set([...ruta, nodo.id])}
              onMover={onMover}
              onQuitar={onQuitar}
              onAgregar={onAgregar}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function OrganigramaAdmin() {
  const { usuario: usuarioActual } = useAuth();
  const [relaciones, setRelaciones] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null); // { modo, nodo, jefeActualId }
  const [errorModal, setErrorModal] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cargar = () => {
    setCargando(true);
    setError("");
    adminApi
      .obtenerOrganigrama()
      .then((datos) => {
        setRelaciones(datos.relaciones);
        setUsuarios(datos.usuarios);
      })
      .catch(() => setError("No se pudo cargar el organigrama."))
      .finally(() => setCargando(false));
  };

  useEffect(cargar, []);

  const { raices, sinEquipo } = useMemo(() => {
    const esJefe = new Set(relaciones.map((r) => r.jefe_id));
    const esSubordinado = new Set(relaciones.map((r) => r.usuario_id));
    return {
      raices: usuarios.filter((u) => esJefe.has(u.id) && !esSubordinado.has(u.id)),
      sinEquipo: usuarios.filter((u) => !esJefe.has(u.id) && !esSubordinado.has(u.id)),
    };
  }, [relaciones, usuarios]);

  if (!usuarioActual?.es_super_admin) {
    return (
      <div className="planb">
        <PageHeader titulo="Organigrama" />
        <div className="planb__contenido">
          <p style={{ color: "var(--color-text-muted)" }}>No tienes acceso a esta pantalla.</p>
        </div>
      </div>
    );
  }

  const abrirMover = (nodo, jefeActualId) => setModal({ modo: "mover", nodo, jefeActualId });
  const abrirAgregar = (nodo) => setModal({ modo: "agregar", nodo, jefeActualId: null });
  const abrirAsignar = (nodo) => setModal({ modo: "asignar", nodo, jefeActualId: null });

  const quitar = async (nodo, jefeActualId) => {
    if (!window.confirm(`¿Quitar a "${nodo.nombre}" del equipo de esa persona?`)) return;
    try {
      await adminApi.quitarDeOrganigrama(jefeActualId, nodo.id);
      cargar();
    } catch (err) {
      setError(err.response?.data?.detail || "No se pudo quitar.");
    }
  };

  const guardarModal = async (jefeNuevoId, rol) => {
    setGuardando(true);
    setErrorModal("");
    try {
      if (modal.modo === "agregar") {
        // Aquí modal.nodo ES el jefe (se agrega alguien A su equipo) --
        // jefeNuevoId del formulario en realidad es la PERSONA elegida.
        await adminApi.asignarEnOrganigrama(modal.nodo.id, jefeNuevoId, rol);
      } else {
        if (modal.modo === "mover") {
          await adminApi.quitarDeOrganigrama(modal.jefeActualId, modal.nodo.id);
        }
        await adminApi.asignarEnOrganigrama(jefeNuevoId, modal.nodo.id, rol);
      }
      setModal(null);
      cargar();
    } catch (err) {
      setErrorModal(err.response?.data?.detail || "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="planb">
      <PageHeader
        titulo="Organigrama"
        acciones={
          <Link to="/admin/usuarios" className="btn btn--ghost">
            ← Administración de usuarios
          </Link>
        }
      />
      <div className="planb__contenido stack">
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
          Árbol de jefe → subordinado, armado con la misma información de "Mi equipo" de cada
          persona. Una persona puede aparecer bajo más de un jefe si así quedó cargada — se
          muestra tal cual, sin forzarla a un solo lugar.
        </p>

        {cargando && <p style={{ color: "var(--color-text-muted)" }}>Cargando...</p>}
        {error && <p className="error-text">{error}</p>}

        {!cargando && !error && (
          <>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {raices.map((raiz) => (
                <NodoOrganigrama
                  key={raiz.id}
                  nodo={raiz}
                  relaciones={relaciones}
                  jefeIdDeEsteNodo={null}
                  ruta={new Set()}
                  onMover={abrirMover}
                  onQuitar={quitar}
                  onAgregar={abrirAgregar}
                />
              ))}
            </ul>

            {sinEquipo.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <h3>Sin equipo asignado</h3>
                <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
                  No aparecen como jefe ni como subordinado de nadie todavía.
                </p>
                <ul style={{ listStyle: "none", padding: 0 }}>
                  {sinEquipo.map((u) => (
                    <li
                      key={u.id}
                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}
                    >
                      <span>
                        {u.nombre}
                        {!u.activo ? " (inactivo)" : ""}
                      </span>
                      <button type="button" className="btn btn--ghost" onClick={() => abrirAsignar(u)}>
                        Asignar a un jefe
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>

      {modal?.modo === "mover" && (
        <ModalAsignar
          titulo={`Mover a "${modal.nodo.nombre}"`}
          personaNombre={modal.nodo.nombre}
          usuarios={usuarios}
          jefeActualId={modal.jefeActualId}
          onGuardar={guardarModal}
          onCerrar={() => setModal(null)}
          error={errorModal}
          guardando={guardando}
        />
      )}
      {modal?.modo === "asignar" && (
        <ModalAsignar
          titulo={`Asignar jefe a "${modal.nodo.nombre}"`}
          personaNombre={modal.nodo.nombre}
          usuarios={usuarios}
          jefeActualId={modal.nodo.id}
          onGuardar={guardarModal}
          onCerrar={() => setModal(null)}
          error={errorModal}
          guardando={guardando}
        />
      )}
      {modal?.modo === "agregar" && (
        <ModalAsignarPersona
          jefeNombre={modal.nodo.nombre}
          usuarios={usuarios.filter((u) => u.id !== modal.nodo.id)}
          onGuardar={guardarModal}
          onCerrar={() => setModal(null)}
          error={errorModal}
          guardando={guardando}
        />
      )}
    </div>
  );
}

// Variante del modal para "Agregar a su equipo": aquí se elige la PERSONA
// (no el jefe, que ya está fijo) -- reusa el mismo onGuardar(id, rol) de
// arriba, solo cambia qué representa ese primer id.
function ModalAsignarPersona({ jefeNombre, usuarios, onGuardar, onCerrar, error, guardando }) {
  const [personaId, setPersonaId] = useState(usuarios[0]?.id || "");
  const [rol, setRol] = useState("N3");

  return (
    <Modal titulo={`Agregar persona al equipo de "${jefeNombre}"`} onCerrar={onCerrar}>
      <div className="stack">
        <label className="stack" style={{ gap: 4 }}>
          <span style={{ fontSize: "0.85rem" }}>Persona</span>
          <select className="input" value={personaId} onChange={(e) => setPersonaId(e.target.value)}>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
                {!u.activo ? " (inactivo)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="stack" style={{ gap: 4 }}>
          <span style={{ fontSize: "0.85rem" }}>Rol default</span>
          <select className="input" value={rol} onChange={(e) => setRol(e.target.value)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="error-text">{error}</p>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="btn btn--ghost" onClick={onCerrar}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={guardando || !personaId}
            onClick={() => onGuardar(Number(personaId), rol)}
          >
            {guardando ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

import { useState } from "react";
import { entregablesApi, proyectosApi } from "../api/endpoints";
import Modal from "./Modal";

// Acceso rápido para asignar un entregable/tarea a alguien de tu equipo
// SIN tener que entrar primero a un proyecto/tema específico (2026-08-20,
// a petición de Yue: "una opción rápida de hacerlo"). El modelo de datos
// sigue exigiendo un proyecto_id (no existe "tarea suelta" sin tema a nivel
// de base de datos) -- se resuelve pidiendo persona primero, y con eso se
// filtran solo los temas donde ESA persona ya participa y que quien asigna
// administra (viewer_puede_administrar), para no tener que buscarlo en
// Seguimiento/Proyectos. Notifica automáticamente al responsable (mismo
// mecanismo que crear un entregable desde dentro de un proyecto, ver
// FormularioEntregable.jsx / crear_entregable en el backend).
//
// El tema es OPCIONAL (2026-08-20, a petición de Yue, tras preguntar por
// qué el asistente de voz lo exigía) -- el select de tema tiene "Sin tema
// (tareas sueltas)" como primera opción, seleccionada por default: menos
// clics para el caso común, solo se elige un tema real si de verdad se
// quiere uno. Al guardar sin tema elegido, se resuelve/crea primero el
// tema personal "Tareas sueltas" del RESPONSABLE (proyectosApi.tareasSueltas,
// ver app/services/proyectos.py::obtener_o_crear_tema_tareas_sueltas) y esa
// tarea cae ahí -- no bajo quien la asigna.
//
// `personaInicialId` (opcional, 2026-08-20, tarjeta "Persona" de Agenda
// Plan B): si viene, la persona ya llega elegida desde afuera (un selector
// previo) y este modal arranca directo en el paso de elegir tema, sin
// mostrar de nuevo el select de persona.
export default function ModalAsignarTareaRapida({ equipo, personaInicialId, onCerrar, onCreado }) {
  const [personaId, setPersonaId] = useState(personaInicialId || "");
  const [proyectoId, setProyectoId] = useState("");
  const [nombre, setNombre] = useState("");
  const [fechaEntrega, setFechaEntrega] = useState("");
  const [urgenteManual, setUrgenteManual] = useState(false);
  const [requiereComprobante, setRequiereComprobante] = useState(false);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const persona = equipo.find((m) => String(m.usuario_id) === personaId);
  // Solo temas donde YO administro (puedo asignar) -- mismo permiso que ya
  // exige el backend en crear_entregable, filtrado aquí para no ofrecer
  // opciones que de todos modos se rechazarían al guardar.
  const proyectosDisponibles = (persona?.proyectos || []).filter((p) => p.viewer_puede_administrar);

  const handleCambiarPersona = (id) => {
    setPersonaId(id);
    setProyectoId("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setGuardando(true);
    try {
      let idProyectoFinal = proyectoId ? Number(proyectoId) : null;
      if (!idProyectoFinal) {
        const temaSueltas = await proyectosApi.tareasSueltas(Number(personaId));
        idProyectoFinal = temaSueltas.id;
      }
      await entregablesApi.crear(idProyectoFinal, {
        nombre,
        descripcion: null,
        responsable_id: Number(personaId),
        fecha_entrega: fechaEntrega,
        sensible: false,
        urgente_manual: urgenteManual,
        requiere_comprobante: requiereComprobante,
      });
      onCreado();
    } catch (err) {
      setError(err.response?.data?.detail || "No se pudo asignar la tarea.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal titulo="Asignar tarea a mi equipo" onCerrar={onCerrar}>
      <form className="stack" onSubmit={handleSubmit}>
        {personaInicialId ? (
          <p style={{ margin: 0, fontSize: "0.9rem" }}>
            Para: <strong>{persona?.nombre}</strong>
          </p>
        ) : (
          <label className="stack" style={{ gap: 4 }}>
            <span style={{ fontSize: "0.85rem" }}>Persona</span>
            <select
              className="input"
              value={personaId}
              onChange={(e) => handleCambiarPersona(e.target.value)}
              required
            >
              <option value="" disabled>
                Selecciona una persona de tu equipo
              </option>
              {equipo.map((m) => (
                <option key={m.usuario_id} value={m.usuario_id}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </label>
        )}

        {personaId && (
          <label className="stack" style={{ gap: 4 }}>
            <span style={{ fontSize: "0.85rem" }}>Proyecto (opcional)</span>
            <select
              className="input"
              value={proyectoId}
              onChange={(e) => setProyectoId(e.target.value)}
            >
              <option value="">Sin proyecto (tareas sueltas)</option>
              {proyectosDisponibles.map((p) => (
                <option key={p.proyecto_id} value={p.proyecto_id}>
                  {p.proyecto_nombre}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="stack" style={{ gap: 4 }}>
          <span style={{ fontSize: "0.85rem" }}>Nombre de la tarea</span>
          <input
            className="input"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
          />
        </label>

        <label className="stack" style={{ gap: 4 }}>
          <span style={{ fontSize: "0.85rem" }}>Fecha de entrega</span>
          <input
            className="input"
            type="date"
            value={fechaEntrega}
            onChange={(e) => setFechaEntrega(e.target.value)}
            required
          />
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={urgenteManual}
            onChange={(e) => setUrgenteManual(e.target.checked)}
          />
          <span style={{ fontSize: "0.85rem" }}>Marcar como urgente</span>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={requiereComprobante}
            onChange={(e) => setRequiereComprobante(e.target.checked)}
          />
          <span style={{ fontSize: "0.85rem" }}>
            Requiere comprobante (una imagen) para poder marcarse como completado
          </span>
        </label>

        {error && <p className="error-text">{error}</p>}

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            className="btn btn--primary"
            type="submit"
            disabled={guardando || !personaId}
          >
            {guardando ? "Asignando..." : "Asignar y notificar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

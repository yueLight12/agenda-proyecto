import { useState } from "react";
import { entregablesApi, proyectosApi } from "../api/endpoints";
import { esFinDeSemana } from "../utils/finDeSemana";
import BuscadorInvitados from "./BuscadorInvitados";
import Modal from "./Modal";
import ModalFinDeSemana from "./ModalFinDeSemana";
import SelectorProyecto from "./SelectorProyecto";

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
  // "Asignar a varios" (2026-09-23, a petición de Yue: "mandar reportes
  // semanales a todo mi equipo sin ir uno por uno") -- crea una tarea
  // INDEPENDIENTE por cada persona elegida, no una tarea compartida. Solo
  // disponible cuando no viene una persona ya fija desde afuera
  // (personaInicialId), y sin selector de proyecto (cada persona puede
  // participar en proyectos distintos) -- cae en "Tareas sueltas" de cada
  // quien, igual que el caso de una sola persona sin tema elegido.
  const [modoMultiple, setModoMultiple] = useState(false);
  const [personasIds, setPersonasIds] = useState([]);
  const [proyectoId, setProyectoId] = useState("");
  const [nombre, setNombre] = useState("");
  const [fechaEntrega, setFechaEntrega] = useState("");
  const [horaEntrega, setHoraEntrega] = useState("");
  const [urgenteManual, setUrgenteManual] = useState(false);
  const [requiereComprobante, setRequiereComprobante] = useState(false);
  // "Copiar a" (2026-09-22, a petición de Yue: "Bernardo asigna una tarea
  // a Diana, pero quiere que Juan también se entere -- no es de/para
  // Juan, solo se entera") -- varias personas, solo reciben una
  // notificación in-app, no son responsables de nada. Mismo buscador tipo
  // Teams que ya se usa para invitar a una reunión.
  const [copiadosIds, setCopiadosIds] = useState([]);
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

  // Aviso de fin de semana (2026-09-02, a petición de Yue) -- mismo patrón
  // que FormularioEntregable.jsx: `guardar` es la lógica real, se llama con
  // la fecha ya decidida tras resolver el aviso si aplica.
  const [confirmandoFinDeSemana, setConfirmandoFinDeSemana] = useState(false);

  const guardar = async (fechaFinal) => {
    setError("");
    setGuardando(true);
    try {
      if (modoMultiple) {
        // Cada persona puede no compartir proyecto -- siempre cae en su
        // propio tema "Tareas sueltas", igual que el caso de una sola
        // persona sin tema elegido. Se usa el tema de la PRIMERA persona
        // solo para poder llamar al endpoint (que cuelga de un proyecto),
        // pero como no hay tema elegido en modo múltiple, el backend
        // simplemente crea cada tarea en el proyecto indicado -- así que
        // resolvemos "tareas sueltas" por cada quien antes de mandar.
        for (const idPersona of personasIds) {
          const temaSueltas = await proyectosApi.tareasSueltas(Number(idPersona));
          await entregablesApi.crear(temaSueltas.id, {
            nombre,
            descripcion: null,
            responsable_id: Number(idPersona),
            fecha_entrega: fechaFinal,
            hora_entrega: horaEntrega || null,
            sensible: false,
            urgente_manual: urgenteManual,
            requiere_comprobante: requiereComprobante,
            copiados_ids: copiadosIds.map(Number),
          });
        }
      } else {
        let idProyectoFinal = proyectoId ? Number(proyectoId) : null;
        if (!idProyectoFinal) {
          const temaSueltas = await proyectosApi.tareasSueltas(Number(personaId));
          idProyectoFinal = temaSueltas.id;
        }
        await entregablesApi.crear(idProyectoFinal, {
          nombre,
          descripcion: null,
          responsable_id: Number(personaId),
          fecha_entrega: fechaFinal,
          hora_entrega: horaEntrega || null,
          sensible: false,
          urgente_manual: urgenteManual,
          requiere_comprobante: requiereComprobante,
          copiados_ids: copiadosIds.map(Number),
        });
      }
      onCreado();
    } catch (err) {
      setError(err.response?.data?.detail || "No se pudo asignar la tarea.");
    } finally {
      setGuardando(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (esFinDeSemana(fechaEntrega)) {
      setConfirmandoFinDeSemana(true);
      return;
    }
    await guardar(fechaEntrega);
  };

  const handleElegirFinDeSemana = async (fechaFinal) => {
    setConfirmandoFinDeSemana(false);
    if (fechaFinal !== fechaEntrega) setFechaEntrega(fechaFinal);
    await guardar(fechaFinal);
  };

  return (
    <Modal titulo="Asignar tarea a mi equipo" onCerrar={onCerrar}>
      <form className="stack" onSubmit={handleSubmit}>
        {personaInicialId ? (
          <p style={{ margin: 0, fontSize: "0.9rem" }}>
            Para: <strong>{persona?.nombre}</strong>
          </p>
        ) : (
          <>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={modoMultiple}
                onChange={(e) => {
                  setModoMultiple(e.target.checked);
                  setPersonaId("");
                  setPersonasIds([]);
                  setProyectoId("");
                }}
              />
              <span style={{ fontSize: "0.85rem" }}>Asignar a varias personas</span>
            </label>

            {modoMultiple ? (
              <div className="stack" style={{ gap: 4 }}>
                <span style={{ fontSize: "0.85rem" }}>Personas</span>
                <p style={{ color: "var(--color-text-muted)", fontSize: "0.78rem", margin: 0 }}>
                  Cada una recibe su propia tarea individual, no una tarea compartida.
                </p>
                <BuscadorInvitados
                  candidatos={equipo}
                  seleccionadosIds={personasIds}
                  onCambiar={setPersonasIds}
                />
              </div>
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
          </>
        )}

        {!modoMultiple && personaId && (
          <label className="stack" style={{ gap: 4 }}>
            <span style={{ fontSize: "0.85rem" }}>Proyecto (opcional)</span>
            <SelectorProyecto
              proyectos={proyectosDisponibles.map((p) => ({
                id: p.proyecto_id,
                nombre: p.proyecto_nombre,
                parent_id: p.parent_id,
              }))}
              value={proyectoId}
              onChange={setProyectoId}
              placeholder="Sin proyecto (tareas sueltas)"
            />
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

        <label className="stack" style={{ gap: 4 }}>
          <span style={{ fontSize: "0.85rem" }}>Hora (opcional)</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              className="input"
              type="time"
              value={horaEntrega}
              onChange={(e) => setHoraEntrega(e.target.value)}
              style={{ flex: 1 }}
            />
            {/* El "x" nativo del navegador para limpiar un <input type="time">
                solo aparece al pasar el mouse justo encima -- fácil de no ver
                (2026-09-23, duda real de Yue). Este botón hace lo mismo de
                forma explícita. */}
            {horaEntrega && (
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setHoraEntrega("")}
              >
                Quitar hora
              </button>
            )}
          </div>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={urgenteManual}
            onChange={(e) => setUrgenteManual(e.target.checked)}
          />
          <span style={{ fontSize: "0.85rem" }}>Marcar como urgente</span>
        </label>

        {/* "Requiere comprobante" oculto por ahora (2026-09-17, a petición
            de Yue: falló al asignar una tarea con esto activado) -- no se
            borra, solo se deja de mostrar. requiereComprobante se queda en
            false (su default) y así se manda al backend. Para reactivarlo,
            quitar el `false &&` de abajo. */}
        {false && (
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={requiereComprobante}
              onChange={(e) => setRequiereComprobante(e.target.checked)}
            />
            <span style={{ fontSize: "0.85rem" }}>Requiere comprobante</span>
          </label>
        )}

        {(modoMultiple ? personasIds.length > 0 : personaId) && (
          <div className="stack" style={{ gap: 4 }}>
            <span style={{ fontSize: "0.85rem" }}>Copiar a (opcional)</span>
            <p style={{ color: "var(--color-text-muted)", fontSize: "0.78rem", margin: 0 }}>
              Solo se enteran de que existe la tarea -- no son responsables de nada.
            </p>
            <BuscadorInvitados
              candidatos={equipo.filter((m) =>
                modoMultiple
                  ? !personasIds.includes(m.usuario_id)
                  : String(m.usuario_id) !== personaId
              )}
              seleccionadosIds={copiadosIds}
              onCambiar={setCopiadosIds}
            />
          </div>
        )}

        {error && <p className="error-text">{error}</p>}

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            className="btn btn--primary"
            type="submit"
            disabled={guardando || (modoMultiple ? personasIds.length === 0 : !personaId)}
          >
            {guardando
              ? "Asignando..."
              : modoMultiple
              ? `Asignar a ${personasIds.length || ""} persona(s) y notificar`
              : "Asignar y notificar"}
          </button>
        </div>
      </form>

      {confirmandoFinDeSemana && (
        <ModalFinDeSemana
          fecha={fechaEntrega}
          onDejar={() => handleElegirFinDeSemana(fechaEntrega)}
          onMover={handleElegirFinDeSemana}
          onCancelar={() => setConfirmandoFinDeSemana(false)}
        />
      )}
    </Modal>
  );
}

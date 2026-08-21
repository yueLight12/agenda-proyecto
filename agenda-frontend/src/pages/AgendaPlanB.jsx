import { useCallback, useEffect, useState } from "react";
import { equipoResumenApi } from "../api/endpoints";
import { useAuth } from "../context/AuthContext";
import Modal from "../components/Modal";
import ModalAsignarTareaRapida from "../components/ModalAsignarTareaRapida";
import ModalEditarProyecto from "../components/ModalEditarProyecto";
import CalendarioGlobal from "./CalendarioGlobal";
import FabAsistenteVoz from "../components/FabAsistenteVoz";
import SelectorSemanaDestacado from "../components/planB/SelectorSemanaDestacado";
import TarjetasAsignar from "../components/planB/TarjetasAsignar";
import SelectorPersona from "../components/planB/SelectorPersona";
import PendientesUrgentes from "../components/planB/PendientesUrgentes";

// Pantalla única "Agenda Plan B" (2026-08-20, a petición de Yue, a partir de
// un boceto a mano) -- ES la ventana principal del sistema ahora ("/" monta
// esto directo, ver App.jsx): sin sidebar/topbar de AppLayout.jsx, pensada
// para resolver en pocos clics lo más común (asignar una tarea, crear un
// tema, ver pendientes urgentes) sin tener que navegar primero a un
// proyecto/tema específico. El sistema anterior (Seguimiento/Proyectos/Mis
// pendientes/Calendario/etc., bajo AppLayout) NO se borró -- sigue intacto
// como respaldo ("segundo plan", palabras de Yue) en /equipo, /proyectos/:id,
// etc., pero sin ningún link visible desde aquí -- Yue pidió explícitamente
// que no haya botón de regreso a la app anterior. Reusa los mismos
// formularios/modales que ya usaba el resto del sistema (ModalAsignarTareaRapida,
// ModalEditarProyecto, CalendarioGlobal), sin duplicar lógica.
export default function AgendaPlanB() {
  const { usuario, logout } = useAuth();
  const [fechaRef, setFechaRef] = useState(new Date());
  const [equipo, setEquipo] = useState([]);
  const [cargandoEquipo, setCargandoEquipo] = useState(true);
  const [errorEquipo, setErrorEquipo] = useState("");
  const [modalActivo, setModalActivo] = useState(null); // 'tarea' | 'proyecto' | 'persona' | 'agenda' | null
  const [personaElegida, setPersonaElegida] = useState(null);
  const [recargarPendientes, setRecargarPendientes] = useState(0);

  const cargarEquipo = useCallback(() => {
    setCargandoEquipo(true);
    setErrorEquipo("");
    return equipoResumenApi
      .resumen()
      .then((data) => setEquipo(data.miembros))
      .catch(() => setErrorEquipo("No se pudo cargar tu equipo."))
      .finally(() => setCargandoEquipo(false));
  }, []);

  useEffect(() => {
    cargarEquipo();
  }, [cargarEquipo]);

  const cerrarModal = () => {
    setModalActivo(null);
    setPersonaElegida(null);
  };

  const alTerminarAsignacion = () => {
    cerrarModal();
    setRecargarPendientes((n) => n + 1);
  };

  return (
    <div className="planb">
      <div className="planb__topbar">
        <div>
          <h1 style={{ margin: 0, fontSize: "1.4rem" }}>Agenda Plan B</h1>
          {usuario && (
            <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
              {usuario.nombre}
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn btn--ghost" onClick={logout}>
            Salir
          </button>
        </div>
      </div>

      <div className="planb__contenido stack">
        <SelectorSemanaDestacado fechaRef={fechaRef} onCambiarFecha={setFechaRef} />

        <div className="card">
          <h2 style={{ fontSize: "1rem", marginBottom: 12 }}>Quiero asignar</h2>
          <TarjetasAsignar onAbrir={setModalActivo} />
        </div>

        <PendientesUrgentes recargarSenal={recargarPendientes} />
      </div>

      {modalActivo === "tarea" && !cargandoEquipo && (
        <ModalAsignarTareaRapida
          equipo={equipo}
          onCerrar={cerrarModal}
          onCreado={alTerminarAsignacion}
        />
      )}

      {modalActivo === "proyecto" && (
        <ModalEditarProyecto onCerrar={cerrarModal} onGuardado={alTerminarAsignacion} />
      )}

      {modalActivo === "persona" && !personaElegida && !cargandoEquipo && (
        <SelectorPersona
          equipo={equipo}
          error={errorEquipo}
          onElegir={setPersonaElegida}
          onCerrar={cerrarModal}
        />
      )}

      {modalActivo === "persona" && personaElegida && (
        <ModalAsignarTareaRapida
          equipo={equipo}
          personaInicialId={personaElegida}
          onCerrar={cerrarModal}
          onCreado={alTerminarAsignacion}
        />
      )}

      {modalActivo === "agenda" && (
        <Modal titulo="Agenda (calendario)" onCerrar={cerrarModal}>
          {/* Modal agrandado vía CSS (.modal-card:has(.planb__calendario),
              ver app.css) -- el calendario completo con su propio toolbar
              no cabe en el modal genérico (max-width: 480px) sin scroll
              feo anidado (reporte real de Yue). altoCalendario más generoso
              que el default de 600px para aprovechar el modal más grande. */}
          <div className="planb__calendario">
            <CalendarioGlobal altoCalendario={700} />
          </div>
        </Modal>
      )}

      {/* Asistente de voz (2026-08-20, a petición de Yue) -- mismo botón
          flotante que ya existía en AppLayout.jsx, reusado tal cual: crea/
          edita/consulta lo que sea sin tener que navegar a ningún proyecto
          específico primero, encaja con el propósito de Plan B. Sin
          `proyectoIdContexto` (null) porque aquí no hay un proyecto "actual"
          como en TableroProyecto.jsx -- el asistente sigue funcionando
          igual, solo pregunta el tema si la instrucción lo necesita. */}
      <FabAsistenteVoz proyectoIdContexto={null} />
    </div>
  );
}

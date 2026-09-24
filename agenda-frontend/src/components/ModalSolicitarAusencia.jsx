import { useState } from "react";
import { solicitudesAusenciaApi } from "../api/endpoints";
import BuscadorInvitados from "./BuscadorInvitados";
import Modal from "./Modal";

// "Solicitar ausencia" (2026-09-23, a petición de Yue: "Juan quiere pedir
// sus vacaciones, tiene que pedírselo a David y copiar a Bernardo").
// El aprobador NO se elige aquí -- se resuelve solo en el backend a partir
// del supervisor real de quien solicita (mismo criterio que "Asignado
// por", ver resolver_supervisor_real en app/services/equipos.py). Este
// modal solo pide tipo, fechas, y a quién copiar (opcional) -- mismo
// buscador tipo Teams que ya se usa para invitar a una reunión o copiar en
// una tarea.
const TIPOS = [
  { valor: "vacaciones", etiqueta: "Vacaciones" },
  { valor: "permiso", etiqueta: "Permiso" },
  { valor: "incapacidad", etiqueta: "Incapacidad" },
];

export default function ModalSolicitarAusencia({ equipo, onCerrar, onCreado }) {
  const [tipo, setTipo] = useState("vacaciones");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [copiadosIds, setCopiadosIds] = useState([]);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setGuardando(true);
    try {
      await solicitudesAusenciaApi.crear({
        tipo,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        copiados_ids: copiadosIds.map(Number),
      });
      onCreado();
    } catch (err) {
      setError(err.response?.data?.detail || "No se pudo enviar la solicitud.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal titulo="Solicitar ausencia" onCerrar={onCerrar}>
      <form className="stack" onSubmit={handleSubmit}>
        <label className="stack" style={{ gap: 4 }}>
          <span style={{ fontSize: "0.85rem" }}>Tipo</span>
          <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TIPOS.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.etiqueta}
              </option>
            ))}
          </select>
        </label>

        <label className="stack" style={{ gap: 4 }}>
          <span style={{ fontSize: "0.85rem" }}>Del</span>
          <input
            className="input"
            type="date"
            value={fechaInicio}
            onChange={(e) => setFechaInicio(e.target.value)}
            required
          />
        </label>

        <label className="stack" style={{ gap: 4 }}>
          <span style={{ fontSize: "0.85rem" }}>Al</span>
          <input
            className="input"
            type="date"
            value={fechaFin}
            onChange={(e) => setFechaFin(e.target.value)}
            required
          />
        </label>

        <div className="stack" style={{ gap: 4 }}>
          <span style={{ fontSize: "0.85rem" }}>Copiar a (opcional)</span>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.78rem", margin: 0 }}>
            Solo se enteran -- no aprueban nada. Si la solicitud se aprueba, también les
            aparece en su calendario.
          </p>
          <BuscadorInvitados
            candidatos={equipo}
            seleccionadosIds={copiadosIds}
            onCambiar={setCopiadosIds}
          />
        </div>

        {error && <p className="error-text">{error}</p>}

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="btn btn--primary" type="submit" disabled={guardando}>
            {guardando ? "Enviando..." : "Enviar solicitud"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

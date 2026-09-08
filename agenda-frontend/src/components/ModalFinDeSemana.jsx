import Modal from "./Modal";
import { diaHabilMasCercano, nombreDiaFinDeSemana } from "../utils/finDeSemana";

function formatoCorto(fechaStr) {
  return new Date(`${fechaStr}T00:00:00`).toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
}

// Aviso de fin de semana (2026-09-02, a petición de Yue) -- se muestra antes
// de guardar una reunión o tarea con fecha en sábado/domingo. 3 salidas: dejar
// la fecha tal cual, moverla al día hábil más cercano, o cancelar (no se
// guarda nada, el usuario sigue editando el formulario).
export default function ModalFinDeSemana({ fecha, onDejar, onMover, onCancelar }) {
  const dia = nombreDiaFinDeSemana(fecha);
  const fechaMovida = diaHabilMasCercano(fecha);
  const diaMovido = dia === "sábado" ? "viernes" : "lunes";

  return (
    <Modal titulo="Esa fecha cae en fin de semana" onCerrar={onCancelar}>
      <div className="stack">
        <p style={{ margin: 0 }}>
          Elegiste {formatoCorto(fecha)}, que es {dia}. ¿Qué quieres hacer?
        </p>
        <div className="stack" style={{ gap: 8 }}>
          <button className="btn btn--primary" type="button" onClick={onDejar}>
            Dejarlo en {dia}
          </button>
          <button className="btn btn--ghost" type="button" onClick={() => onMover(fechaMovida)}>
            Moverlo al {diaMovido} más cercano ({formatoCorto(fechaMovida)})
          </button>
          <button className="btn btn--ghost" type="button" onClick={onCancelar}>
            Cancelar
          </button>
        </div>
      </div>
    </Modal>
  );
}

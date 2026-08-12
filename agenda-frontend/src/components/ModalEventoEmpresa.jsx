import Modal from "./Modal";

const ETIQUETA_TIPO = {
  cumpleanos: "🎂 Cumpleaños",
  festivo: "📌 Día festivo",
  evento: "🎉 Evento de empresa",
};

// Detalle de un evento de empresa (cumpleaños/festivo/evento) al hacer
// clic en el calendario — de solo lectura, no hay UI de edición (la carga
// es manual vía cargar_eventos_empresa.py, ver CLAUDE.md).
export default function ModalEventoEmpresa({ evento, onCerrar }) {
  return (
    <Modal titulo={evento.nombre} onCerrar={onCerrar}>
      <div className="stack">
        <p>
          <strong>{ETIQUETA_TIPO[evento.tipo] || evento.tipo}</strong>
        </p>
        <p>
          {new Date(evento.fecha + "T00:00:00").toLocaleDateString("es-MX", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
        {evento.tipo === "cumpleanos" && (
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
            Se repite cada año en esta fecha.
          </p>
        )}
      </div>
    </Modal>
  );
}

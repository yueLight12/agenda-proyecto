import Modal from "./Modal";

// Diálogo de confirmación reutilizable, en vez de window.confirm() nativo
// (que se veía fuera de lugar contra el resto de la interfaz ya diseñada).
// Reemplaza los window.confirm() de borrados en toda la app — ver CLAUDE.md.
export default function ConfirmDialog({
  titulo = "Confirmar",
  mensaje,
  textoConfirmar = "Eliminar",
  peligro = true,
  onConfirmar,
  onCancelar,
}) {
  return (
    <Modal titulo={titulo} onCerrar={onCancelar}>
      <div className="stack">
        <p style={{ margin: 0 }}>{mensaje}</p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn btn--ghost" type="button" onClick={onCancelar}>
            Cancelar
          </button>
          <button
            className="btn btn--primary"
            type="button"
            onClick={onConfirmar}
            style={peligro ? { background: "var(--color-danger)", borderColor: "var(--color-danger)" } : undefined}
          >
            {textoConfirmar}
          </button>
        </div>
      </div>
    </Modal>
  );
}

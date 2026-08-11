export default function Modal({ titulo, onCerrar, children }) {
  return (
    <div className="modal-overlay" onClick={onCerrar}>
      <div className="modal-card card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-card__header">
          <h2 style={{ fontSize: "1.1rem", margin: 0 }}>{titulo}</h2>
          <button className="btn btn--ghost" type="button" onClick={onCerrar}>
            Cerrar
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

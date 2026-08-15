export default function PreviewNota({ preview }) {
  return (
    <div className="stack" style={{ gap: 4 }}>
      {preview.destino && (
        <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>Sobre: {preview.destino}</span>
      )}
      <p style={{ margin: 0 }}>{preview.contenido}</p>
      <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>— {preview.autor_nombre}</span>
    </div>
  );
}

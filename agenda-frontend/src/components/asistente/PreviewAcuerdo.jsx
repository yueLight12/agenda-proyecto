export default function PreviewAcuerdo({ preview }) {
  return (
    <div className="stack" style={{ gap: 4 }}>
      <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>Minuta: {preview.reunion_titulo}</span>
      <p style={{ margin: 0 }}>{preview.descripcion}</p>
      {preview.responsable_nombre && (
        <span style={{ fontSize: "0.85rem" }}>Responsable: {preview.responsable_nombre}</span>
      )}
    </div>
  );
}

import PreviewMiembro from "./PreviewMiembro";

export default function PreviewProyecto({ preview }) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div>
        <strong style={{ fontSize: "1.05rem" }}>{preview.nombre}</strong>
        {preview.descripcion && (
          <p style={{ margin: "4px 0 0", color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
            {preview.descripcion}
          </p>
        )}
      </div>
      {preview.equipo?.length > 0 && (
        <div className="stack" style={{ gap: 4 }}>
          {preview.equipo.map((m) => (
            <PreviewMiembro key={m.usuario_id} preview={m} />
          ))}
        </div>
      )}
    </div>
  );
}

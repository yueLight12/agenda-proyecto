function formatearFecha(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("es-MX", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function PreviewReunion({ preview }) {
  return (
    <div className="stack" style={{ gap: 4 }}>
      <strong>{preview.titulo}</strong>
      <span style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
        {formatearFecha(preview.fecha_inicio)}
        {preview.duracion_minutos ? ` · ${preview.duracion_minutos} min` : ""}
        {" — organiza "}
        {preview.organizador_nombre}
      </span>
      {preview.participantes?.length > 0 && (
        <span style={{ fontSize: "0.85rem" }}>
          Invitados: {preview.participantes.map((p) => p.nombre).join(", ")}
        </span>
      )}
    </div>
  );
}

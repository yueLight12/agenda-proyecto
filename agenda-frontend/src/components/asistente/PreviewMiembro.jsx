import { etiquetaRol } from "../../utils/rolLabels";

export default function PreviewMiembro({ preview }) {
  return (
    <div className="stack" style={{ gap: 4 }}>
      {preview.proyecto_nombre && (
        <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
          Tema: {preview.proyecto_nombre}
        </span>
      )}
      <div className="list-inline">
        <div>
          <strong>{preview.nombre}</strong>{" "}
          {preview.puesto && (
            <span style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>({preview.puesto})</span>
          )}
        </div>
        <span className="badge">{etiquetaRol(preview.rol)}</span>
      </div>
    </div>
  );
}

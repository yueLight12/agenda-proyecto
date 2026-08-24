import { Link } from "react-router-dom";

// Cadena de ancestros (raíz primero) de un tema/subtema, para navegar de lo
// general a lo particular (ver GET /proyectos/{id}/ancestros). `actual` es
// el nombre del nodo donde ya estás -- se muestra al final sin link.
export default function Breadcrumb({ ancestros, actual }) {
  if (ancestros.length === 0) return null;

  return (
    <nav
      aria-label="Ruta de proyectos"
      style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", display: "flex", flexWrap: "wrap", gap: 4 }}
    >
      {ancestros.map((a) => (
        <span key={a.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <Link to={`/proyectos/${a.id}`} style={{ color: "inherit" }}>
            {a.nombre}
          </Link>
          <span>/</span>
        </span>
      ))}
      <span>{actual}</span>
    </nav>
  );
}

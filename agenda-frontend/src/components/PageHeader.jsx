import { Link } from "react-router-dom";

// Encabezado compartido para pantallas "secundarias" (Mi perfil, Admin, Mi
// equipo) que viven fuera de Agenda Plan B (2026-09-15, a petición de Yue:
// esas pantallas se veían "sueltas" -- título gigante por default del
// navegador, sin fondo ni tipografía consistente con el resto de "Mi
// Chamba"). Reusa las MISMAS clases que ya usa el topbar de Agenda Plan B
// (.planb/.planb__topbar/.planb__contenido, ver app.css) en vez de
// inventar un estilo nuevo -- así cualquier ajuste futuro al topbar
// principal se refleja aquí también sin tocar nada.
export default function PageHeader({ titulo, subtitulo, volverA = "/", volverTexto = "Mi Chamba", acciones }) {
  return (
    <div className="planb__topbar">
      <div>
        <h1 style={{ fontSize: "1.4rem" }}>{titulo}</h1>
        <Link to={volverA} style={{ fontSize: "0.85rem" }}>
          ← {volverTexto}
        </Link>
        {subtitulo && (
          <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
            {subtitulo}
          </p>
        )}
      </div>
      {acciones && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {acciones}
        </div>
      )}
    </div>
  );
}

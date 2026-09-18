import { useState } from "react";
import { proyectosApi } from "../api/endpoints";
import { colorAvatar } from "../utils/avatarPersona";

// Fila de "Mis proyectos" (2026-09-18, a petición de Yue: "dejemos la vista
// de proyectos como la de personas" y "no abran una ventana nueva al dar
// clic en un proyecto, que sea todo con ventanas flotantes como el resto")
// -- mismas clases CSS que SelectorPersona.jsx (planb__persona-*), para que
// se vea igual en los 6 estilos visuales sin escribir CSS nuevo por tema.
// A diferencia de personas (que solo anida un nivel, el equipo de un
// reporte directo), un proyecto puede anidar subtemas a cualquier
// profundidad -- por eso aquí SÍ hay botón de expandir en cada nivel, no
// solo en el raíz, y los subtemas se envuelven en el mismo
// .planb__persona-subequipo de forma recursiva (el borde izquierdo se va
// acumulando visualmente con cada nivel).
//
// Clic en la fila abre el modal de edición (ModalEditarProyecto) en vez de
// navegar a /proyectos/:id -- ya no hay página de tablero de proyecto
// dentro de este flujo, todo se queda en modales flotantes.
export default function FilaProyecto({ proyecto, onEditar }) {
  const [expandido, setExpandido] = useState(false);
  const [hijos, setHijos] = useState(null); // null = no cargado todavía
  const [cargandoHijos, setCargandoHijos] = useState(false);

  const alternarExpandir = async () => {
    if (!expandido && hijos === null) {
      setCargandoHijos(true);
      try {
        setHijos(await proyectosApi.hijos(proyecto.id));
      } catch {
        setHijos([]);
      } finally {
        setCargandoHijos(false);
      }
    }
    setExpandido((v) => !v);
  };

  const inicial = proyecto.nombre.trim().charAt(0).toUpperCase() || "?";

  return (
    <div>
      <div className="planb__persona-fila-wrap">
        <button type="button" className="planb__persona-fila" onClick={() => onEditar(proyecto)}>
          <span
            className="planb__persona-avatar"
            style={{ background: colorAvatar(proyecto.nombre) }}
            aria-hidden="true"
          >
            {inicial}
          </span>
          <span className="planb__persona-datos">
            <span className="planb__persona-nombre">
              {proyecto.nombre}
              {!proyecto.activo && " (inactivo)"}
            </span>
            {proyecto.descripcion && (
              <span className="planb__persona-puesto">{proyecto.descripcion}</span>
            )}
          </span>
          <span className="planb__persona-elegir" aria-hidden="true">
            Editar
          </span>
        </button>
        {proyecto.tiene_hijos && (
          <button
            type="button"
            className="planb__persona-expandir"
            onClick={alternarExpandir}
            aria-label={expandido ? `Ocultar subtemas de ${proyecto.nombre}` : `Ver subtemas de ${proyecto.nombre}`}
            aria-expanded={expandido}
          >
            {expandido ? "▾" : "▸"}
          </button>
        )}
      </div>
      {expandido && (
        <div className="planb__persona-subequipo">
          {cargandoHijos && <p style={{ color: "var(--color-text-muted)", fontSize: "0.8rem" }}>Cargando...</p>}
          {!cargandoHijos && hijos && hijos.length === 0 && (
            <p style={{ color: "var(--color-text-muted)", fontSize: "0.8rem" }}>
              {proyecto.nombre} no tiene subtemas todavía.
            </p>
          )}
          {!cargandoHijos &&
            hijos &&
            hijos.map((h) => <FilaProyecto key={h.id} proyecto={h} onEditar={onEditar} />)}
        </div>
      )}
    </div>
  );
}

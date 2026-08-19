import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

// Variante de Modal.jsx que se desliza desde la derecha en vez de aparecer
// centrado -- 2026-08-19, a petición de Yue: comentarios/imágenes de un
// tema (SeccionNotas) necesitaban más alto que un modal centrado, pero sin
// oscurecer/tapar la tabla de fondo (a diferencia de Modal, el overlay
// aquí es transparente, solo captura el clic-afuera para cerrar). Misma
// pila de "cuál se cierra con Escape" que Modal.jsx, independiente de esa
// -- pueden convivir un Modal y un PanelLateral abiertos a la vez.
//
// Portal a document.body (a diferencia de Modal.jsx): quien lo abre puede
// estar dentro de un <tbody> (ver FilaTema en KanbanSupervisores.jsx) -- un
// <div> position:fixed ahí sería HTML inválido dentro de una fila de
// tabla, con reparenting impredecible del navegador. El portal lo saca
// limpiamente del árbol de la tabla sin cambiar dónde vive en React.
const pilaPaneles = [];

export default function PanelLateral({ titulo, onCerrar, children }) {
  const idRef = useRef({});

  useEffect(() => {
    const id = idRef.current;
    pilaPaneles.push(id);
    return () => {
      const i = pilaPaneles.indexOf(id);
      if (i !== -1) pilaPaneles.splice(i, 1);
    };
  }, []);

  useEffect(() => {
    const alPresionarTecla = (e) => {
      if (e.key === "Escape" && pilaPaneles[pilaPaneles.length - 1] === idRef.current) {
        onCerrar();
      }
    };
    document.addEventListener("keydown", alPresionarTecla);
    return () => document.removeEventListener("keydown", alPresionarTecla);
  }, [onCerrar]);

  return createPortal(
    <div className="panel-lateral-overlay" onClick={onCerrar}>
      <div className="panel-lateral card" onClick={(e) => e.stopPropagation()}>
        <div className="panel-lateral__header">
          <h2 style={{ fontSize: "1.05rem", margin: 0 }}>{titulo}</h2>
          <button className="btn btn--ghost" type="button" onClick={onCerrar}>
            Cerrar
          </button>
        </div>
        <div className="panel-lateral__body">{children}</div>
      </div>
    </div>,
    document.body
  );
}

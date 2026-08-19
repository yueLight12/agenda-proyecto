import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

// Pila de módulo con los modales abiertos ahora mismo (puede haber más de
// uno, ej. un ConfirmDialog sobre un formulario) — Escape solo cierra el de
// hasta arriba, no todos a la vez.
const pilaModales = [];

export default function Modal({ titulo, onCerrar, children }) {
  const idRef = useRef({});

  useEffect(() => {
    const id = idRef.current;
    pilaModales.push(id);
    return () => {
      const i = pilaModales.indexOf(id);
      if (i !== -1) pilaModales.splice(i, 1);
    };
  }, []);

  useEffect(() => {
    const alPresionarTecla = (e) => {
      if (e.key === "Escape" && pilaModales[pilaModales.length - 1] === idRef.current) {
        onCerrar();
      }
    };
    document.addEventListener("keydown", alPresionarTecla);
    return () => document.removeEventListener("keydown", alPresionarTecla);
  }, [onCerrar]);

  // Portal a document.body (2026-08-19) -- quien abre un Modal puede estar
  // en cualquier parte del árbol, incluida dentro de un <tbody> (ver
  // FilaEntregables en KanbanSupervisores.jsx) -- un overlay position:fixed
  // ahí sería HTML inválido dentro de una fila de tabla, con reparenting
  // impredecible del navegador. El portal lo saca limpiamente del DOM de
  // origen sin cambiar dónde vive en el árbol de React ni cómo se ve.
  return createPortal(
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
    </div>,
    document.body
  );
}

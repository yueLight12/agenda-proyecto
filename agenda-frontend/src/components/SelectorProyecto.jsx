import { useEffect, useMemo, useRef, useState } from "react";

// Selector de proyecto/tema con jerarquía visible (2026-09-07, a petición
// de Yue: el <select> nativo mostraba la "ruta" completa repetida en cada
// renglón -- "Acción Social > Alamos ( RS )", "Acción Social > Arte y
// Cultura ( SV )", etc. -- y en Android eso se ve como una lista plana
// gigante, sin jerarquía, difícil de escanear. Aquí cada renglón muestra
// SOLO su propio nombre, indentado según su profundidad (contando los
// " > " de `ruta`) -- así "Alamos ( RS )" se lee como hijo de "Acción
// Social" en vez de repetir el padre en cada línea. Incluye un buscador
// porque la lista real tiene decenas de temas/subtemas.
//
// `ruta` es opcional en cada proyecto (2026-09-07, para reusar esto en
// ModalAsignarTareaRapida.jsx: esa lista trae `parent_id` pero no una
// `ruta` ya armada como sí hace /proyectos/arbol-visible) -- si falta, se
// arma aquí mismo caminando `parent_id` DENTRO de la lista recibida; si el
// padre no viene en la lista (p.ej. la persona no participa ahí), se usa
// solo el nombre propio, sin romper nada.
function calcularProfundidad(ruta) {
  return ruta.split(" > ").length - 1;
}

function conRutasCalculadas(proyectos) {
  const porId = new Map(proyectos.map((p) => [p.id, p]));
  const cache = new Map();
  const rutaDe = (p) => {
    if (cache.has(p.id)) return cache.get(p.id);
    const padre = p.parent_id != null ? porId.get(p.parent_id) : null;
    const ruta = padre ? `${rutaDe(padre)} > ${p.nombre}` : p.nombre;
    cache.set(p.id, ruta);
    return ruta;
  };
  return proyectos.map((p) => ({ ...p, ruta: p.ruta || rutaDe(p) }));
}

export default function SelectorProyecto({
  proyectos: proyectosSinRuta,
  value,
  onChange,
  placeholder = "Todos los proyectos",
}) {
  const proyectos = useMemo(() => conRutasCalculadas(proyectosSinRuta), [proyectosSinRuta]);
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const contenedorRef = useRef(null);
  const buscadorRef = useRef(null);

  useEffect(() => {
    if (!abierto) return undefined;
    const alHacerClickFuera = (e) => {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target)) setAbierto(false);
    };
    document.addEventListener("mousedown", alHacerClickFuera);
    return () => document.removeEventListener("mousedown", alHacerClickFuera);
  }, [abierto]);

  useEffect(() => {
    if (abierto) buscadorRef.current?.focus();
  }, [abierto]);

  const seleccionado = proyectos.find((p) => String(p.id) === String(value));

  const filtrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return proyectos;
    return proyectos.filter((p) => p.ruta.toLowerCase().includes(texto));
  }, [proyectos, busqueda]);

  const elegir = (id) => {
    onChange(id);
    setAbierto(false);
    setBusqueda("");
  };

  return (
    <div className="selector-proyecto" ref={contenedorRef}>
      <button
        type="button"
        className="input selector-proyecto__boton"
        onClick={() => setAbierto((a) => !a)}
        aria-haspopup="listbox"
        aria-expanded={abierto}
      >
        <span className="selector-proyecto__boton-texto">
          {seleccionado ? seleccionado.ruta : placeholder}
        </span>
        <span aria-hidden="true">▾</span>
      </button>

      {abierto && (
        <div className="selector-proyecto__panel" role="listbox">
          <input
            ref={buscadorRef}
            className="input selector-proyecto__buscador"
            type="search"
            placeholder="Buscar tema o subtema..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          <div className="selector-proyecto__lista">
            <div
              className={`selector-proyecto__opcion${!value ? " selector-proyecto__opcion--activa" : ""}`}
              role="option"
              aria-selected={!value}
              onClick={() => elegir("")}
            >
              {placeholder}
            </div>
            {filtrados.length === 0 && (
              <div className="selector-proyecto__vacio">Sin resultados para "{busqueda}"</div>
            )}
            {filtrados.map((p) => (
              <div
                key={p.id}
                className={`selector-proyecto__opcion${
                  String(p.id) === String(value) ? " selector-proyecto__opcion--activa" : ""
                }`}
                style={busqueda.trim() ? undefined : { paddingLeft: `${12 + calcularProfundidad(p.ruta) * 18}px` }}
                role="option"
                aria-selected={String(p.id) === String(value)}
                onClick={() => elegir(String(p.id))}
                title={p.ruta}
              >
                {busqueda.trim() ? p.ruta : p.nombre}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

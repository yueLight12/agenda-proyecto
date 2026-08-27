import { useEffect, useRef, useState } from "react";
import MiSemana from "./MiSemana";
import { semanaActual, textoRangoSemana } from "../../utils/fechas";

// Cuántas tarjetas de semana se muestran a la vez alrededor de la
// seleccionada (2 antes + activa + 2 después = 5), mismo criterio del
// boceto de Yue (varias semanas visibles, no solo ◀ texto ▶).
const SEMANAS_ANTES = 2;
const SEMANAS_DESPUES = 2;

function sumarSemanas(fecha, delta) {
  const resultado = new Date(fecha);
  resultado.setDate(resultado.getDate() + delta * 7);
  return resultado;
}

// Selector de semana para Agenda Plan B (2026-08-20, rediseñado a petición
// de Yue con una segunda referencia visual: una fila con scroll horizontal
// de tarjetas -- una por semana, cada una con su propio número/rango de
// fechas -- en vez de un solo texto central con ◀/▶. La tarjeta que se está
// NAVEGANDO (delta 0, la que corresponde a `fechaRef`) siempre se ve grande
// y con fondo sólido (--color-teal-600), sin importar si es o no la semana
// real de hoy -- eso evita perder de vista "dónde estás parado" al navegar.
// El texto SÍ distingue una cosa de otra (a petición de Yue, 2026-08-20:
// "esta semana es la actual... cuando llegue la próxima semana entonces ahí
// automáticamente pasa a ser la semana actual"): solo la tarjeta cuyo
// número de semana coincide con el de HOY (fecha real del sistema, no de
// `fechaRef`) dice "Esta semana"; cualquier otra, incluida la navegada/
// activa, dice "Semana N". El título "Minuta — Semana N" arriba se mantiene
// igual que en el boceto. Datos: mismo `equipoResumenApi.historialSemana`
// de siempre, vía ContenidoHistorialSemana (HistorialMinutas.jsx) -- no se
// duplica lógica de negocio, solo cambia la presentación del selector.
// Al hacer clic en la tarjeta activa se despliega "Mi semana" (MiSemana.jsx,
// mis tareas + mi agenda de esa semana) en vez del resumen de temas de
// minuta que se mostraba antes -- reemplazado a petición de Yue (2026-08-22).
export default function SelectorSemanaDestacado({ fechaRef, onCambiarFecha, onAbrirEntregable, onAbrirReunion }) {
  // Desplegado por default (2026-08-27, a petición de Yue: "mis tareas,
  // las que asigné, mi agenda" no deberían requerir un clic extra al
  // entrar a la ventana principal) -- sigue pudiéndose colapsar/expandir
  // con el mismo clic en la tarjeta activa de siempre.
  const [mostrarDetalle, setMostrarDetalle] = useState(true);
  const semanaVigente = semanaActual(fechaRef);
  const numeroSemanaHoy = semanaActual(new Date()).numero;
  const activaRef = useRef(null);

  const tarjetas = [];
  for (let i = -SEMANAS_ANTES; i <= SEMANAS_DESPUES; i++) {
    const fecha = sumarSemanas(fechaRef, i);
    tarjetas.push({ delta: i, fecha, semana: semanaActual(fecha) });
  }

  // Fix real (2026-08-21, reporte de Yue: "se ve muy a la derecha, tiene
  // que quedar centrado", visto en celular): `justify-content: center` en
  // .planb__semana-scroll (ver app.css) no hace nada cuando el contenido
  // ya no cabe (esta fila, con 5 tarjetas, casi nunca cabe en una pantalla
  // angosta) -- ahí el navegador simplemente arranca el scroll en el borde
  // izquierdo, dejando la tarjeta activa donde caiga, no centrada. El fix
  // real es de JS: centrar la tarjeta activa dentro del contenedor visible
  // cada vez que cambia (al navegar ◀/▶ o al montar).
  useEffect(() => {
    activaRef.current?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [fechaRef]);

  const irASemana = (delta) => {
    onCambiarFecha(sumarSemanas(fechaRef, delta));
  };

  return (
    <div className="card planb__semana">
      <h2 className="planb__semana-titulo">Minuta — Semana {semanaVigente.numero}</h2>

      <div className="planb__semana-fila">
        <button
          className="btn btn--ghost planb__semana-flecha"
          type="button"
          onClick={() => irASemana(-1)}
          aria-label="Semana anterior"
        >
          ◀
        </button>

        <div className="planb__semana-scroll">
          {tarjetas.map((t) => (
            <button
              key={t.delta}
              ref={t.delta === 0 ? activaRef : null}
              type="button"
              className={
                t.delta === 0
                  ? "planb__semana-tarjeta planb__semana-tarjeta--activa"
                  : "planb__semana-tarjeta"
              }
              onClick={() => (t.delta === 0 ? setMostrarDetalle((v) => !v) : irASemana(t.delta))}
              aria-current={t.delta === 0 ? "true" : undefined}
            >
              <span className="planb__semana-tarjeta-numero">
                {t.semana.numero === numeroSemanaHoy ? "Esta semana" : `Semana ${t.semana.numero}`}
              </span>
              <span className="planb__semana-tarjeta-rango">{textoRangoSemana(t.semana)}</span>
            </button>
          ))}
        </div>

        <button
          className="btn btn--ghost planb__semana-flecha"
          type="button"
          onClick={() => irASemana(1)}
          aria-label="Semana siguiente"
        >
          ▶
        </button>
      </div>

      {mostrarDetalle && (
        <div style={{ marginTop: 12 }}>
          <MiSemana semana={semanaVigente} onAbrirEntregable={onAbrirEntregable} onAbrirReunion={onAbrirReunion} />
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import addDays from "date-fns/addDays";
import format from "date-fns/format";
import startOfWeek from "date-fns/startOfWeek";
import isSameDay from "date-fns/isSameDay";
import es from "date-fns/locale/es";

// Vista "Semana" tipo Teams (2026-08-22, a petición de Yue, probada primero
// como prototipo visual antes de construirse aquí). Reemplaza la vista
// Semana/Día de react-big-calendar en AMBOS viewports desde el
// 2026-08-22 (originalmente solo era para celular, de ahí el nombre
// "VistaSemanaMovil" -- se generalizó y renombró cuando Yue pidió el mismo
// estilo para escritorio). react-big-calendar sigue viva SOLO para Mes
// (ver CalendarioEntregables.jsx) -- Yue pidió expresamente conservar el
// mes completo.
//
// `columnasFijas` decide la única diferencia real entre viewports: en
// escritorio (true) las 7 columnas se reparten el ancho disponible sin
// scroll horizontal; en celular (false, default) cada columna tiene un
// ancho mínimo fijo y se navega con scroll horizontal + snap, porque 7
// columnas angostas de verdad no caben legibles en una pantalla de celular.
//
// Simplificación consciente v1: la franja de horas es fija 07:00–21:00
// (horario laboral típico) -- un evento fuera de ese rango se recorta
// visualmente al borde más cercano pero sigue siendo tocable. Ampliar el
// rango dinámicamente por semana es posible después si hace falta.
const HORA_INICIO = 7;
const HORA_FIN = 21;
const ALTO_HORA_PX = 56;
const MAX_TODO_EL_DIA_VISIBLE = 2;

function horaFmt(fecha) {
  const h = fecha.getHours();
  const m = fecha.getMinutes();
  const periodo = h < 12 ? "a" : "p";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${periodo}` : `${h12}:${String(m).padStart(2, "0")}${periodo}`;
}

function claseDeEvento(evento) {
  if (evento.resource.tipo === "reunion") return "vsem-evento--reunion";
  if (evento.resource.tipo === "evento_empresa") return "vsem-evento--empresa";
  const estatus = evento.resource.datos.estatus;
  if (estatus === "en_progreso") return "vsem-evento--en_progreso";
  if (estatus === "cumplido") return "vsem-evento--cumplido";
  return "vsem-evento--pendiente";
}

function manejarClick(evento, { onEntregableClick, onReunionClick, onEventoEmpresaClick }) {
  if (evento.resource.tipo === "reunion") onReunionClick?.(evento.resource.datos);
  else if (evento.resource.tipo === "entregable") onEntregableClick?.(evento.resource.datos);
  else if (evento.resource.tipo === "evento_empresa") onEventoEmpresaClick?.(evento.resource.datos);
}

export default function VistaSemana({
  eventos,
  onEntregableClick,
  onReunionClick,
  onEventoEmpresaClick,
  onSeleccionarFranja,
  columnasFijas = false,
}) {
  const [ancla, setAncla] = useState(() => startOfWeek(new Date(), { locale: es }));
  const dias = Array.from({ length: 7 }, (_, i) => addDays(ancla, i));
  const hoy = new Date();

  const tiraDiasRef = useRef(null);
  const diasScrollRef = useRef(null);
  const sincronizandoRef = useRef(false);

  useEffect(() => {
    const tira = tiraDiasRef.current;
    const scroll = diasScrollRef.current;
    if (!tira || !scroll) return;
    const sync = (origen, destino) => {
      if (sincronizandoRef.current) return;
      sincronizandoRef.current = true;
      destino.scrollLeft = origen.scrollLeft;
      sincronizandoRef.current = false;
    };
    const alScrollTira = () => sync(tira, scroll);
    const alScrollGrilla = () => sync(scroll, tira);
    tira.addEventListener("scroll", alScrollTira);
    scroll.addEventListener("scroll", alScrollGrilla);
    return () => {
      tira.removeEventListener("scroll", alScrollTira);
      scroll.removeEventListener("scroll", alScrollGrilla);
    };
  }, []);

  const horas = Array.from({ length: HORA_FIN - HORA_INICIO }, (_, i) => HORA_INICIO + i);

  const eventosDeDia = (dia) => eventos.filter((e) => isSameDay(e.start, dia));

  const handlers = { onEntregableClick, onReunionClick, onEventoEmpresaClick };

  const seleccionarFranja = (dia, hora) => {
    if (!onSeleccionarFranja) return;
    const anio = dia.getFullYear();
    const mes = String(dia.getMonth() + 1).padStart(2, "0");
    const d = String(dia.getDate()).padStart(2, "0");
    onSeleccionarFranja({
      fecha: `${anio}-${mes}-${d}`,
      hora: hora === null ? null : `${String(hora).padStart(2, "0")}:00`,
      duracionMinutos: 30,
    });
  };

  const claseRaiz = `vsem${columnasFijas ? " vsem--fijo" : ""}`;

  return (
    <div className={claseRaiz}>
      <div className="vsem__nav">
        <button type="button" className="vsem__nav-btn" onClick={() => setAncla((a) => addDays(a, -7))} aria-label="Semana anterior">
          ‹
        </button>
        <button type="button" className="vsem__nav-hoy" onClick={() => setAncla(startOfWeek(new Date(), { locale: es }))}>
          Hoy
        </button>
        <button type="button" className="vsem__nav-btn" onClick={() => setAncla((a) => addDays(a, 7))} aria-label="Semana siguiente">
          ›
        </button>
        <span className="vsem__nav-label">
          {(() => {
            const texto = format(ancla, "MMMM yyyy", { locale: es });
            return texto.charAt(0).toUpperCase() + texto.slice(1);
          })()}
        </span>
      </div>

      <div className="vsem__tira-dias" ref={tiraDiasRef}>
        {dias.map((dia) => {
          const esHoy = isSameDay(dia, hoy);
          const tieneEventos = eventosDeDia(dia).length > 0;
          return (
            <button
              key={dia.toISOString()}
              type="button"
              className={`vsem__dia-chip${esHoy ? " vsem__dia-chip--hoy" : ""}`}
              onClick={() => seleccionarFranja(dia, null)}
            >
              <span className="vsem__dia-chip-nombre">{format(dia, "EEE", { locale: es }).replace(/\.$/, "")}</span>
              <span className="vsem__dia-chip-numero">{format(dia, "d")}</span>
              <span className={`vsem__dia-chip-punto${tieneEventos ? " vsem__dia-chip-punto--visible" : ""}`} aria-hidden="true" />
            </button>
          );
        })}
      </div>

      <div className="vsem__grilla-wrap">
        <div className="vsem__grilla">
          <div className="vsem__columna-horas">
            <div className="vsem__todo-el-dia-espaciador" style={{ height: MAX_TODO_EL_DIA_VISIBLE * 26 + 4 }} />
            {horas.map((h) => (
              <div key={h} className="vsem__hora-marca" style={{ height: ALTO_HORA_PX }}>
                {horaFmt(new Date(2000, 0, 1, h, 0))}
              </div>
            ))}
          </div>
          <div className="vsem__dias-scroll" ref={diasScrollRef}>
            {dias.map((dia) => {
              const eventosDia = eventosDeDia(dia);
              const todoElDia = eventosDia.filter((e) => e.allDay);
              const conHora = eventosDia.filter((e) => !e.allDay);
              const esHoy = isSameDay(dia, hoy);
              const minutosAhora = esHoy ? hoy.getHours() * 60 + hoy.getMinutes() : null;
              const mostrarLineaAhora =
                minutosAhora !== null && minutosAhora >= HORA_INICIO * 60 && minutosAhora <= HORA_FIN * 60;

              return (
                <div key={dia.toISOString()} className="vsem__columna-dia">
                  <div
                    className="vsem__todo-el-dia"
                    style={{ height: MAX_TODO_EL_DIA_VISIBLE * 26 + 4 }}
                  >
                    {todoElDia.slice(0, MAX_TODO_EL_DIA_VISIBLE).map((ev) => (
                      <button
                        key={ev.id}
                        type="button"
                        className={`vsem-evento vsem-evento--todoeldia ${claseDeEvento(ev)}`}
                        onClick={() => manejarClick(ev, handlers)}
                      >
                        {ev.title}
                      </button>
                    ))}
                    {todoElDia.length > MAX_TODO_EL_DIA_VISIBLE && (
                      <span className="vsem__todo-el-dia-mas">+{todoElDia.length - MAX_TODO_EL_DIA_VISIBLE} más</span>
                    )}
                  </div>

                  <div className="vsem__horas-dia">
                    {horas.map((h) => (
                      <div
                        key={h}
                        className="vsem__franja-hora"
                        style={{ height: ALTO_HORA_PX }}
                        onClick={() => seleccionarFranja(dia, h)}
                      />
                    ))}

                    {mostrarLineaAhora && (
                      <div
                        className="vsem__linea-ahora"
                        style={{ top: ((minutosAhora - HORA_INICIO * 60) / 60) * ALTO_HORA_PX }}
                      >
                        <span className="vsem__linea-ahora-etiqueta">
                          {String(hoy.getHours()).padStart(2, "0")}:{String(hoy.getMinutes()).padStart(2, "0")}
                        </span>
                      </div>
                    )}

                    {conHora.map((ev) => {
                      const inicioMin = Math.max(HORA_INICIO * 60, ev.start.getHours() * 60 + ev.start.getMinutes());
                      const finMin = Math.min(HORA_FIN * 60, Math.max(inicioMin + 20, ev.end.getHours() * 60 + ev.end.getMinutes()));
                      const top = ((inicioMin - HORA_INICIO * 60) / 60) * ALTO_HORA_PX;
                      const alto = Math.max(24, ((finMin - inicioMin) / 60) * ALTO_HORA_PX - 3);
                      return (
                        <button
                          key={ev.id}
                          type="button"
                          className={`vsem-evento ${claseDeEvento(ev)}`}
                          style={{ top: top + 2, height: alto }}
                          onClick={(e) => {
                            e.stopPropagation();
                            manejarClick(ev, handlers);
                          }}
                        >
                          <span className="vsem-evento__hora">{horaFmt(ev.start)}</span>
                          {ev.title}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

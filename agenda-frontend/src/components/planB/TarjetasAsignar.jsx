import { IconoAgenda, IconoPersona, IconoProyecto, IconoRendimiento, IconoTarea } from "./IconosPlanB";

// Grid 2x2 "Quiero asignar" de Agenda Plan B (2026-08-20) -- solo UI +
// callback, sin lógica de datos propia. Cada tarjeta abre un modal distinto
// en AgendaPlanB.jsx vía `onAbrir(tipo)`.
//
// El icono (2026-08-21, réplica exacta del diseño "nuevo") solo se ve
// cuando ese estilo está activo -- oculto por CSS en el diseño clásico
// (ver `.planb__tarjeta-icono { display: none }` en app.css), que no
// tenía iconos y no debe cambiar. Los iconos son SVG de línea propios
// (IconosPlanB.jsx), no una librería nueva.
const TARJETAS = [
  { tipo: "tarea", Icono: IconoTarea, titulo: "Tarea", texto: "Asignar una tarea a alguien de tu equipo." },
  { tipo: "proyecto", Icono: IconoProyecto, titulo: "Proyecto", texto: "Crear un proyecto nuevo, para ti o para tu equipo." },
  { tipo: "persona", Icono: IconoPersona, titulo: "Persona", texto: "Elegir a alguien y asignarle una tarea." },
  { tipo: "agenda", Icono: IconoAgenda, titulo: "Agenda (calendario)", texto: "Ver y reprogramar el calendario." },
  { tipo: "rendimiento", Icono: IconoRendimiento, titulo: "Rendimiento", texto: "Ver métricas de tu equipo: quién entrega más y a tiempo." },
];

// cardOrder (2026-08-26, panel "Personalizar apariencia") -- array opcional
// de tipos en el orden que eligió el usuario (ver usePreferenciasApariencia.js).
// Si viene vacío/incompleto (usuario nunca lo configuró, o llegó un tipo
// desconocido) se cae de vuelta al orden fijo de TARJETAS -- nunca se
// pierde una tarjeta por una preferencia inconsistente.
function ordenarTarjetas(cardOrder) {
  if (!Array.isArray(cardOrder) || cardOrder.length !== TARJETAS.length) return TARJETAS;
  const porTipo = Object.fromEntries(TARJETAS.map((t) => [t.tipo, t]));
  const ordenadas = cardOrder.map((tipo) => porTipo[tipo]).filter(Boolean);
  return ordenadas.length === TARJETAS.length ? ordenadas : TARJETAS;
}

export default function TarjetasAsignar({ onAbrir, cardOrder }) {
  const tarjetas = ordenarTarjetas(cardOrder);
  return (
    <div className="planb__tarjetas">
      {tarjetas.map((t) => (
        <button
          key={t.tipo}
          type="button"
          className="planb__tarjeta"
          onClick={() => onAbrir(t.tipo)}
        >
          <span className="planb__tarjeta-icono" aria-hidden="true">
            <t.Icono />
          </span>
          <span className="planb__tarjeta-titulo">{t.titulo}</span>
          <span className="planb__tarjeta-texto">{t.texto}</span>
        </button>
      ))}
    </div>
  );
}

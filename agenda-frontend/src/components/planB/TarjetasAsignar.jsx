// Grid 2x2 "Quiero asignar" de Agenda Plan B (2026-08-20) -- solo UI +
// callback, sin lógica de datos propia. Cada tarjeta abre un modal distinto
// en AgendaPlanB.jsx vía `onAbrir(tipo)`.
//
// El icono (2026-08-21) solo se ve en el diseño "nuevo" (ver
// [data-estilo-planb="nuevo"] en app.css) -- en el diseño clásico queda
// oculto por CSS para no alterar el look ya aprobado. Se usa un emoji
// simple en vez de una librería de íconos nueva (mismo criterio ya usado
// en el proyecto para eventos de empresa, ver ICONO_TIPO_EVENTO_EMPRESA en
// CalendarioEntregables.jsx).
const TARJETAS = [
  { tipo: "tarea", icono: "✅", titulo: "Tarea", texto: "Asignar una tarea a alguien de tu equipo." },
  { tipo: "proyecto", icono: "🗂️", titulo: "Proyecto", texto: "Crear un tema nuevo, para ti o para tu equipo." },
  { tipo: "persona", icono: "👤", titulo: "Persona", texto: "Elegir a alguien y asignarle una tarea." },
  { tipo: "agenda", icono: "📅", titulo: "Agenda (calendario)", texto: "Ver y reprogramar el calendario." },
];

export default function TarjetasAsignar({ onAbrir }) {
  return (
    <div className="planb__tarjetas">
      {TARJETAS.map((t) => (
        <button
          key={t.tipo}
          type="button"
          className="planb__tarjeta"
          onClick={() => onAbrir(t.tipo)}
        >
          <span className="planb__tarjeta-icono" aria-hidden="true">{t.icono}</span>
          <span className="planb__tarjeta-titulo">{t.titulo}</span>
          <span className="planb__tarjeta-texto">{t.texto}</span>
        </button>
      ))}
    </div>
  );
}

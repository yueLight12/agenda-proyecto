// Grid 2x2 "Quiero asignar" de Agenda Plan B (2026-08-20) -- solo UI +
// callback, sin lógica de datos propia. Cada tarjeta abre un modal distinto
// en AgendaPlanB.jsx vía `onAbrir(tipo)`.
const TARJETAS = [
  { tipo: "tarea", titulo: "Tarea", texto: "Asignar una tarea a alguien de tu equipo." },
  { tipo: "proyecto", titulo: "Proyecto", texto: "Crear un tema nuevo, para ti o para tu equipo." },
  { tipo: "persona", titulo: "Persona", texto: "Elegir a alguien y asignarle una tarea." },
  { tipo: "agenda", titulo: "Agenda (calendario)", texto: "Ver y reprogramar el calendario." },
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
          <span className="planb__tarjeta-titulo">{t.titulo}</span>
          <span className="planb__tarjeta-texto">{t.texto}</span>
        </button>
      ))}
    </div>
  );
}

import PreviewAcuerdo from "./PreviewAcuerdo";
import PreviewEntregable from "./PreviewEntregable";
import PreviewMiembro from "./PreviewMiembro";
import PreviewNota from "./PreviewNota";
import PreviewProyecto from "./PreviewProyecto";
import PreviewReunion from "./PreviewReunion";

const COMPONENTES = {
  entregable: PreviewEntregable,
  proyecto: PreviewProyecto,
  miembro: PreviewMiembro,
  reunion: PreviewReunion,
  nota: PreviewNota,
  acuerdo: PreviewAcuerdo,
};

// Pinta una vista previa fiel de lo que va a quedar (tarjeta de
// entregable/proyecto/reunión/etc.) en vez de que la confirmación del
// asistente sea solo una frase de texto. Si `preview` viene vacío o con un
// tipo que todavía no está cubierto, no renderiza nada — el `resumen` en
// texto sigue mostrándose aparte, así que nunca se rompe la confirmación.
export default function VistaPreviaAccion({ preview }) {
  if (!preview) return null;
  const Componente = COMPONENTES[preview.tipo];
  if (!Componente) return null;
  return (
    <div className="card" style={{ padding: 12 }}>
      <Componente preview={preview} />
    </div>
  );
}

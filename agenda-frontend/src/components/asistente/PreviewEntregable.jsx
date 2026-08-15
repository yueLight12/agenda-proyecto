import { TarjetaEntregable } from "../KanbanEntregables";

export default function PreviewEntregable({ preview }) {
  const entregable = {
    id: 0,
    nombre: preview.nombre,
    descripcion: preview.descripcion,
    fecha_entrega: preview.fecha_entrega,
    responsable_id: preview.responsable_id,
    porcentaje_avance: preview.porcentaje_avance,
    sensible: preview.sensible,
  };
  const equipo = preview.responsable_id
    ? [{ usuario_id: preview.responsable_id, nombre: preview.responsable_nombre }]
    : [];
  return (
    <TarjetaEntregable entregable={entregable} equipo={equipo} onDragStart={() => {}} onClick={() => {}} />
  );
}

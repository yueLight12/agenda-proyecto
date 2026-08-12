import HistorialAvance from "./HistorialAvance";
import Modal from "./Modal";

export default function ModalHistorial({ entregable, miembros, onCerrar }) {
  return (
    <Modal titulo={`Histórico de avance — ${entregable.nombre}`} onCerrar={onCerrar}>
      <HistorialAvance entregableId={entregable.id} miembros={miembros} />
    </Modal>
  );
}

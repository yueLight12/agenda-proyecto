import { useEffect, useState } from "react";
import { equipoResumenApi, proyectosApi } from "../api/endpoints";
import { useAuth } from "../context/AuthContext";
import KanbanSupervisores from "./KanbanSupervisores";
import ModalEquipo from "./ModalEquipo";

export default function ResumenEquipo() {
  const { usuario } = useAuth();
  const [miembros, setMiembros] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [modalProyecto, setModalProyecto] = useState(null); // { id, nombre } | null
  const [miembrosModal, setMiembrosModal] = useState([]);

  const cargar = () =>
    equipoResumenApi
      .resumen()
      .then((data) => setMiembros(data.miembros))
      .catch(() => setError("No se pudo cargar el resumen de tu equipo. Intenta de nuevo más tarde."))
      .finally(() => setCargando(false));

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const abrirAdministrar = async (proyectoId, proyectoNombre) => {
    const equipo = await proyectosApi.equipo(proyectoId);
    setMiembrosModal(equipo);
    setModalProyecto({ id: proyectoId, nombre: proyectoNombre });
  };

  const refrescarModal = async () => {
    const fresco = await proyectosApi.equipo(modalProyecto.id);
    setMiembrosModal(fresco);
    await cargar();
  };

  if (cargando) return <p>Cargando resumen de tu equipo...</p>;
  if (error) return <p className="error-text">{error}</p>;

  return (
    <div className="stack">
      <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
        Las reuniones que se muestran aquí son solo las que tú también puedes ver (donde tú
        organizas o estás invitado) — no necesariamente todas las reuniones de cada persona.
      </p>

      <KanbanSupervisores
        miembros={miembros}
        onAdministrar={abrirAdministrar}
        usuarioActualId={usuario?.id}
      />

      {modalProyecto && (
        <ModalEquipo
          proyectoId={modalProyecto.id}
          miembros={miembrosModal}
          onCambio={refrescarModal}
          onCerrar={() => setModalProyecto(null)}
        />
      )}
    </div>
  );
}

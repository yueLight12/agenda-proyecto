import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { entregablesApi, equipoResumenApi } from "../api/endpoints";
import KanbanEntregables from "./KanbanEntregables";

// "Vencida" no es un estatus real guardado en la BD (ver
// app/models/entregable.py, EstatusEntregable solo tiene pendiente/
// en_progreso/cumplido) -- se calcula aquí igual que en el resto del
// frontend (KanbanSupervisores, KanbanEquipoProyecto): no cumplido y con
// fecha_entrega pasada. La columna es de solo lectura porque no hay un
// estatus real "vencida" que asignar al soltar una tarjeta ahí; para
// sacar un entregable de esta columna hay que marcarlo cumplido (o
// recorrer su fecha), lo que lo mueve solo por este mismo cálculo.
const COLUMNAS_ESTATUS = [
  {
    estatus: "pendiente",
    titulo: "Por hacer",
    porcentajeObjetivo: 0,
    filtro: (e) => e.estatus === "pendiente" && !e.vencido,
  },
  {
    estatus: "en_progreso",
    titulo: "En proceso",
    porcentajeObjetivo: 50,
    filtro: (e) => e.estatus === "en_progreso" && !e.vencido,
  },
  {
    estatus: "cumplido",
    titulo: "Entregadas/Completadas",
    porcentajeObjetivo: 100,
    filtro: (e) => e.estatus === "cumplido",
  },
  { titulo: "Vencidas", soloLectura: true, filtro: (e) => e.vencido },
];

export default function VistaEstatusEquipo() {
  const navigate = useNavigate();
  const [miembros, setMiembros] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [errorAvance, setErrorAvance] = useState("");

  const cargar = () =>
    equipoResumenApi
      .resumen()
      .then((data) => setMiembros(data.miembros))
      .catch(() => setError("No se pudo cargar el estatus del equipo. Intenta de nuevo más tarde."))
      .finally(() => setCargando(false));

  useEffect(() => {
    cargar();
  }, []);

  if (cargando) return <p>Cargando estatus del equipo...</p>;
  if (error) return <p className="error-text">{error}</p>;

  const hoyIso = new Date().toISOString().slice(0, 10);
  const entregables = miembros.flatMap((m) =>
    m.proyectos.flatMap((p) =>
      p.entregables.map((e) => ({
        ...e,
        responsable_id: m.usuario_id,
        proyecto_id: p.proyecto_id,
        proyecto_nombre: p.proyecto_nombre,
        vencido: e.estatus !== "cumplido" && e.fecha_entrega < hoyIso,
      }))
    )
  );
  const equipo = miembros.map((m) => ({ usuario_id: m.usuario_id, nombre: m.nombre }));

  const moverEstatus = async (entregable, porcentajeObjetivo) => {
    setErrorAvance("");
    try {
      await entregablesApi.actualizarAvance(entregable.id, porcentajeObjetivo);
      await cargar();
    } catch {
      setErrorAvance("No se pudo mover el entregable. Intenta de nuevo.");
    }
  };

  return (
    <KanbanEntregables
      entregables={entregables}
      equipo={equipo}
      columnas={COLUMNAS_ESTATUS}
      onMoverEstatus={moverEstatus}
      onEntregableClick={(e) => navigate(`/app/proyectos/${e.proyecto_id}?entregable=${e.id}`)}
      error={errorAvance}
    />
  );
}

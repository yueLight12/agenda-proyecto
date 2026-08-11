import { useEffect, useState } from "react";
import { dashboardApi } from "../api/endpoints";
import { useAuth } from "../context/AuthContext";
import { usuarioEsN1EnTodo } from "../utils/roles";
import DashboardCompleto from "../components/DashboardCompleto";
import DashboardSimplificado from "../components/DashboardSimplificado";

export default function Dashboard() {
  const { usuario } = useAuth();
  const [resumen, setResumen] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    dashboardApi
      .resumen()
      .then(setResumen)
      .catch(() => setError("No se pudo cargar el resumen. Intenta de nuevo más tarde."))
      .finally(() => setCargando(false));
  }, []);

  if (cargando) return <p>Cargando resumen...</p>;
  if (error) return <p className="error-text">{error}</p>;

  return (
    <div className="stack">
      <h1>Resumen general</h1>
      {usuarioEsN1EnTodo(usuario) ? (
        <DashboardSimplificado resumen={resumen} />
      ) : (
        <DashboardCompleto resumen={resumen} />
      )}
    </div>
  );
}

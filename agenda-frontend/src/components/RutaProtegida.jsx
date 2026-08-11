import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function RutaProtegida({ children }) {
  const { usuario, cargando } = useAuth();

  if (cargando) return <p style={{ padding: 24 }}>Cargando...</p>;
  if (!usuario) return <Navigate to="/login" replace />;

  return children;
}

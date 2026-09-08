import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import RutaProtegida from "./components/RutaProtegida";
import Login from "./pages/Login";
import AgendaPlanB from "./pages/AgendaPlanB";
import TableroProyecto from "./pages/TableroProyecto";
import Perfil from "./pages/Perfil";
import AdminUsuarios from "./pages/AdminUsuarios";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          {/* Agenda Plan B (2026-08-20, a petición de Yue, a partir de un
              boceto a mano) -- ES la ventana principal ahora: "/" monta esto
              directo, sin AppLayout (sin sidebar/topbar). "/plan-b" se deja
              como alias por si algún link guardado apunta ahí. */}
          <Route
            path="/"
            element={
              <RutaProtegida>
                <AgendaPlanB />
              </RutaProtegida>
            }
          />
          <Route
            path="/plan-b"
            element={
              <RutaProtegida>
                <AgendaPlanB />
              </RutaProtegida>
            }
          />
          {/* Detalle de tema y perfil (2026-08-22): antes vivían bajo /app
              (sistema anterior, ya retirado) -- se conservan aquí solo
              porque Agenda Plan B enlaza directo a ellos desde las tarjetas
              de pendientes urgentes y "Mi semana" (ver
              components/planB/PendientesUrgentes.jsx y MiSemana.jsx) y
              desde el detalle de un miembro del equipo (KanbanEquipoProyecto.jsx).
              Sin AppLayout/sidebar -- se navega a ellas por link, no por
              menú. */}
          <Route
            path="/proyectos/:proyectoId"
            element={
              <RutaProtegida>
                <TableroProyecto />
              </RutaProtegida>
            }
          />
          <Route
            path="/perfil"
            element={
              <RutaProtegida>
                <Perfil />
              </RutaProtegida>
            }
          />
          <Route
            path="/perfil/:usuarioId"
            element={
              <RutaProtegida>
                <Perfil />
              </RutaProtegida>
            }
          />
          {/* Administración de usuarios (2026-09-07) -- solo superadmin, ver
              AdminUsuarios.jsx (el gate real vive en el backend, esta
              pantalla solo se auto-oculta si no aplica). */}
          <Route
            path="/admin/usuarios"
            element={
              <RutaProtegida>
                <AdminUsuarios />
              </RutaProtegida>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

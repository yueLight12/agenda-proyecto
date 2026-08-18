import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import RutaProtegida from "./components/RutaProtegida";
import AppLayout from "./components/AppLayout";
import Login from "./pages/Login";
import TableroProyecto from "./pages/TableroProyecto";
import Equipo from "./pages/Equipo";
import MisPendientes from "./pages/MisPendientes";
import CalendarioGlobal from "./pages/CalendarioGlobal";
import Chatbot from "./pages/Chatbot";
import Perfil from "./pages/Perfil";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <RutaProtegida>
                <AppLayout />
              </RutaProtegida>
            }
          >
            {/* Dashboard oculto (2026-08-17, a petición de Yue) -- Equipo
                pasa a ser la ventana principal. Dashboard.jsx se deja tal
                cual, sin ruta que lo alcance, por si se retoma más
                adelante (mismo criterio ya usado con DashboardCompleto.jsx
                y su expansor "Ver todos los proyectos"). */}
            <Route index element={<Equipo />} />
            {/* "Temas" (lista propia) se retiró 2026-08-17 -- se fusionó
                con "Equipo" (columna "Yo"), ver KanbanSupervisores.jsx.
                Redirect en vez de 404 por si alguien tiene el link guardado. */}
            <Route path="proyectos" element={<Navigate to="/equipo" replace />} />
            <Route path="proyectos/:proyectoId" element={<TableroProyecto />} />
            <Route path="equipo" element={<Equipo />} />
            <Route path="mis-pendientes" element={<MisPendientes />} />
            <Route path="calendario" element={<CalendarioGlobal />} />
            <Route path="chatbot" element={<Chatbot />} />
            <Route path="perfil" element={<Perfil />} />
            <Route path="perfil/:usuarioId" element={<Perfil />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

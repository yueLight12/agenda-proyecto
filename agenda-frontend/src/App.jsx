import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import RutaProtegida from "./components/RutaProtegida";
import AppLayout from "./components/AppLayout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Proyectos from "./pages/Proyectos";
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
            <Route index element={<Dashboard />} />
            <Route path="proyectos" element={<Proyectos />} />
            <Route path="proyectos/:proyectoId" element={<TableroProyecto />} />
            <Route path="equipo" element={<Equipo />} />
            <Route path="mis-pendientes" element={<MisPendientes />} />
            <Route path="calendario" element={<CalendarioGlobal />} />
            <Route path="chatbot" element={<Chatbot />} />
            <Route path="perfil" element={<Perfil />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

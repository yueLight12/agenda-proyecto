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
import AgendaPlanB from "./pages/AgendaPlanB";

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
          {/* Sistema anterior (2026-08-20, a petición de Yue: "no quiero que
              lo elimines, guárdalo como un backup... como un segundo plan")
              -- se conserva COMPLETO e intacto, solo se movió de "/" a
              "/app" y ya no tiene ningún link visible desde Agenda Plan B
              (Yue: "no quiero que haya botón para acceder a la agenda
              anterior"). Sigue siendo accesible tecleando la URL directo. */}
          <Route
            path="/app"
            element={
              <RutaProtegida>
                <AppLayout />
              </RutaProtegida>
            }
          >
            <Route index element={<Equipo />} />
            {/* "Temas" (lista propia) se retiró 2026-08-17 -- se fusionó
                con "Equipo" (columna "Yo"), ver KanbanSupervisores.jsx.
                Redirect en vez de 404 por si alguien tiene el link guardado. */}
            <Route path="proyectos" element={<Navigate to="/app/equipo" replace />} />
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

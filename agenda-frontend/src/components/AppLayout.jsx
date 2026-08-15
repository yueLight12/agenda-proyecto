import { useEffect, useState } from "react";
import { NavLink, Outlet, useMatch } from "react-router-dom";
import { notificacionesApi } from "../api/endpoints";
import { useAuth } from "../context/AuthContext";
import { useTema } from "../hooks/useTema";
import FabAsistenteVoz from "./FabAsistenteVoz";
import ModalCambiarPassword from "./ModalCambiarPassword";
import ModalNotificaciones from "./ModalNotificaciones";

export default function AppLayout() {
  const { usuario, logout } = useAuth();
  const { tema, alternarTema } = useTema();
  const [notificaciones, setNotificaciones] = useState([]);
  const [mostrarNotificaciones, setMostrarNotificaciones] = useState(false);
  const [mostrarCambiarPassword, setMostrarCambiarPassword] = useState(false);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [sidebarColapsado, setSidebarColapsado] = useState(
    () => localStorage.getItem("sidebar_colapsado") === "1"
  );
  const matchProyecto = useMatch("/proyectos/:proyectoId");
  const proyectoIdContexto = matchProyecto ? Number(matchProyecto.params.proyectoId) : null;

  const cargarNotificaciones = () =>
    notificacionesApi.listar(true).then(setNotificaciones).catch(() => {});

  useEffect(() => {
    cargarNotificaciones();
    const intervalo = setInterval(cargarNotificaciones, 60000);
    return () => clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const noLeidas = notificaciones.filter((n) => !n.leida).length;

  const cerrarMenu = () => setMenuAbierto(false);

  const toggleSidebarColapsado = () => {
    setSidebarColapsado((actual) => {
      const nuevo = !actual;
      localStorage.setItem("sidebar_colapsado", nuevo ? "1" : "0");
      return nuevo;
    });
  };

  return (
    <div className="app-shell">
      {menuAbierto && (
        <div
          className="sidebar-backdrop sidebar-backdrop--abierto"
          onClick={cerrarMenu}
        />
      )}
      <aside
        className={`sidebar${menuAbierto ? " sidebar--abierto" : ""}${
          sidebarColapsado ? " sidebar--colapsado" : ""
        }`}
      >
        <div className="sidebar__brand">Agenda Inteligente</div>
        <nav onClick={cerrarMenu}>
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          <NavLink to="/proyectos">Proyectos</NavLink>
          <NavLink to="/equipo">Equipo</NavLink>
          <NavLink to="/mis-pendientes">Mis pendientes</NavLink>
          <NavLink to="/calendario">Calendario</NavLink>
          <NavLink to="/chatbot">Asistente</NavLink>
        </nav>
        <div style={{ marginTop: "auto", fontSize: "0.8rem", color: "#cfe0e3" }}>
          <div>{usuario?.nombre}</div>
          <button
            className="btn btn--ghost"
            style={{ marginTop: 8, color: "#fff", borderColor: "#3a5b70" }}
            onClick={() => setMostrarCambiarPassword(true)}
          >
            Cambiar contraseña
          </button>
          <button
            className="btn btn--ghost"
            style={{ marginTop: 8, color: "#fff", borderColor: "#3a5b70" }}
            onClick={logout}
          >
            Cerrar sesión
          </button>
        </div>
      </aside>
      <div className="app-shell__right">
        <header className="app-topbar">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              className="btn btn--ghost topbar-menu-btn"
              onClick={() => setMenuAbierto(true)}
              aria-label="Abrir menú"
            >
              ☰
            </button>
            <button
              className="btn btn--ghost topbar-collapse-btn"
              onClick={toggleSidebarColapsado}
              aria-label={sidebarColapsado ? "Mostrar menú lateral" : "Ocultar menú lateral"}
              aria-pressed={sidebarColapsado}
            >
              ☰
            </button>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button
              className="btn btn--ghost topbar-tema-btn"
              onClick={alternarTema}
              aria-label={tema === "oscuro" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
              aria-pressed={tema === "oscuro"}
            >
              {tema === "oscuro" ? "☀️" : "🌙"}
            </button>
            <button
              className="btn btn--ghost app-topbar__notificaciones"
              onClick={() => setMostrarNotificaciones(true)}
            >
              Notificaciones
              {noLeidas > 0 && (
                <span
                  className="badge"
                  style={{ background: "var(--color-danger)", color: "#fff" }}
                >
                  {noLeidas}
                </span>
              )}
            </button>
          </div>
        </header>
        <main className="main-content">
          <Outlet />
        </main>
      </div>

      {mostrarNotificaciones && (
        <ModalNotificaciones
          notificaciones={notificaciones}
          onCambio={cargarNotificaciones}
          onCerrar={() => setMostrarNotificaciones(false)}
        />
      )}

      {mostrarCambiarPassword && (
        <ModalCambiarPassword onCerrar={() => setMostrarCambiarPassword(false)} />
      )}

      <FabAsistenteVoz proyectoIdContexto={proyectoIdContexto} />
    </div>
  );
}

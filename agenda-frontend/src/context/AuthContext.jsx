import { createContext, useContext, useEffect, useState } from "react";
import { authApi } from "../api/endpoints";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);

  const cargarPerfil = async () => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      setCargando(false);
      return;
    }
    try {
      const perfil = await authApi.perfil();
      setUsuario(perfil);
    } catch {
      localStorage.removeItem("access_token");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarPerfil();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (email, password) => {
    const { access_token } = await authApi.login(email, password);
    localStorage.setItem("access_token", access_token);
    const perfil = await authApi.perfil();
    setUsuario(perfil);
  };

  const logout = () => {
    localStorage.removeItem("access_token");
    setUsuario(null);
  };

  return (
    <AuthContext.Provider
      value={{ usuario, cargando, login, logout, refrescarPerfil: cargarPerfil }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

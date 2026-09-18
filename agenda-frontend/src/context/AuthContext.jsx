import { createContext, useContext, useEffect, useState } from "react";
import { authApi } from "../api/endpoints";

const AuthContext = createContext(null);

// "Ver como" (2026-09-17) -- mientras se está viendo como otra persona, el
// token real del superadmin se guarda aparte (localStorage, no
// sessionStorage: sobrevive un refresh de la página) para poder volver
// después. Su sola presencia es la señal de "estoy impersonando a
// alguien" -- ver AvisoVerComo.jsx.
const CLAVE_TOKEN_ORIGINAL = "access_token_antes_de_ver_como";

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

  // Login corporativo (SSO/SAML, 2026-09-15) -- a diferencia de login()
  // de arriba, el token ya viene emitido por el backend (ver
  // app/routers/saml_sso.py::acs, que redirige aquí con el token en la
  // URL tras validar la respuesta del IdP) -- este método solo lo guarda
  // y carga el perfil, mismo patrón que el login normal a partir de ahí.
  const iniciarSesionConToken = async (token) => {
    localStorage.setItem("access_token", token);
    const perfil = await authApi.perfil();
    setUsuario(perfil);
  };

  const logout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem(CLAVE_TOKEN_ORIGINAL);
    setUsuario(null);
  };

  // "Ver como" (2026-09-17, a petición de Yue) -- entra con el token de
  // otra persona (emitido por el superadmin vía POST /admin/ver-como/{id},
  // sin necesitar su contraseña) guardando el propio para poder volver.
  const entrarComoOtraPersona = async (tokenNuevo) => {
    const tokenActual = localStorage.getItem("access_token");
    if (tokenActual) localStorage.setItem(CLAVE_TOKEN_ORIGINAL, tokenActual);
    await iniciarSesionConToken(tokenNuevo);
  };

  const volverAMiCuenta = async () => {
    const tokenOriginal = localStorage.getItem(CLAVE_TOKEN_ORIGINAL);
    if (!tokenOriginal) return;
    localStorage.removeItem(CLAVE_TOKEN_ORIGINAL);
    await iniciarSesionConToken(tokenOriginal);
  };

  const viendoComoOtraPersona = Boolean(localStorage.getItem(CLAVE_TOKEN_ORIGINAL));

  return (
    <AuthContext.Provider
      value={{
        usuario,
        cargando,
        login,
        iniciarSesionConToken,
        logout,
        refrescarPerfil: cargarPerfil,
        entrarComoOtraPersona,
        volverAMiCuenta,
        viendoComoOtraPersona,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

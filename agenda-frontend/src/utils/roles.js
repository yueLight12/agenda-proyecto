// Helpers puros sobre el objeto `usuario` que expone useAuth() (ver
// src/context/AuthContext.jsx) — sin dependencias de React.

/**
 * True si el usuario es N1 (dirección) en TODOS los proyectos donde
 * participa, o super admin. Un usuario con rol N2/N3/N4 en cualquier
 * proyecto necesita el dashboard operativo completo, así que no cuenta
 * como "N1 puro" aunque también sea N1 en algún otro proyecto.
 */
export function usuarioEsN1EnTodo(usuario) {
  if (!usuario) return false;
  if (usuario.es_super_admin) return true;
  return (usuario.roles_por_proyecto || []).every((r) => r.rol === "N1");
}

// La supervisión es POR PROYECTO (UsuarioProyectoRol.supervisor_id, ver
// permissions.py) — un mismo usuario puede tener distinto supervisor en
// cada proyecto, por eso se agrupa cruzando proyectos por persona
// SUPERVISORA, no por proyecto.

// Agrupa la respuesta de GET /equipo/resumen por SUPERVISOR (cruzando
// proyectos): una entrada por cada persona que supervisa a alguien en al
// menos un proyecto, con la lista de sus subordinados y, para cada uno,
// sus proyectos/entregables/reuniones bajo ese supervisor. Para "Tu
// equipo" en tarjetas tipo Kanban (una columna = un supervisor).
export function agruparPorSupervisor(miembros) {
  const porId = new Map(miembros.map((m) => [m.usuario_id, m]));
  const supervisores = new Map();

  for (const m of miembros) {
    for (const p of m.proyectos) {
      if (!p.supervisor_id || p.supervisor_id === m.usuario_id) continue;

      if (!supervisores.has(p.supervisor_id)) {
        const info = porId.get(p.supervisor_id);
        supervisores.set(p.supervisor_id, {
          usuario_id: p.supervisor_id,
          nombre: info?.nombre || `Usuario #${p.supervisor_id}`,
          puesto: info?.puesto,
          reportes: new Map(),
        });
      }

      const entrada = supervisores.get(p.supervisor_id);
      if (!entrada.reportes.has(m.usuario_id)) {
        entrada.reportes.set(m.usuario_id, {
          usuario_id: m.usuario_id,
          nombre: m.nombre,
          puesto: m.puesto,
          email: m.email,
          proyectos: [],
        });
      }
      entrada.reportes.get(m.usuario_id).proyectos.push({
        proyecto_id: p.proyecto_id,
        proyecto_nombre: p.proyecto_nombre,
        rol: p.rol,
        entregables: p.entregables,
        reuniones: p.reuniones,
      });
    }
  }

  return Array.from(supervisores.values()).map((s) => ({
    ...s,
    reportes: Array.from(s.reportes.values()),
  }));
}

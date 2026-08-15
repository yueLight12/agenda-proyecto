// Agrupa a los miembros de UN proyecto (forma plana de GET /proyectos/:id/equipo
// — distinta de la de GET /equipo/resumen que usa equipoSupervisores.js, que
// cruza proyectos) por supervisor, para mostrarlos en columnas Kanban con el
// mismo patrón visual que KanbanSupervisores.jsx ("Tu equipo" del Dashboard).
//
// El propio supervisor se incluye como la primera tarjeta de su columna (si
// es miembro visible de este proyecto) para no perder la posibilidad de
// administrarlo (quitarlo) — nadie desaparece de la vista solo por no tener
// reportes o no tener supervisor asignado.
export function agruparEquipoProyectoPorSupervisor(miembros) {
  const porId = new Map(miembros.map((m) => [m.usuario_id, m]));
  const supervisoresIds = [
    ...new Set(
      miembros
        .filter((m) => m.supervisor_id && m.supervisor_id !== m.usuario_id)
        .map((m) => m.supervisor_id)
    ),
  ];

  const columnas = supervisoresIds.map((supId) => {
    const info = porId.get(supId);
    const reportes = miembros.filter((m) => m.supervisor_id === supId);
    return {
      usuario_id: supId,
      nombre: info?.nombre || `Usuario #${supId}`,
      miembros: info ? [info, ...reportes] : reportes,
    };
  });

  const idsYaMostrados = new Set(columnas.flatMap((c) => c.miembros.map((m) => m.usuario_id)));
  const sinSupervisor = miembros.filter((m) => !idsYaMostrados.has(m.usuario_id));

  return { columnas, sinSupervisor };
}

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
      // Si no conocemos al supervisor (no viene en `miembros` — pasa cuando
      // quien ve la pantalla es N3/N4 y solo se ve a sí mismo), no hay con
      // qué armar una columna real: se deja fuera de "por supervisor" y lo
      // resuelve el fallback "por proyecto" en KanbanSupervisores.
      const info = porId.get(p.supervisor_id);
      if (!info) continue;

      if (!supervisores.has(p.supervisor_id)) {
        supervisores.set(p.supervisor_id, {
          usuario_id: p.supervisor_id,
          nombre: info.nombre,
          puesto: info.puesto,
          reportes: new Map(),
          // El propio rol del supervisor en cada proyecto (ej. David es
          // líder de "Cubo") — se usa para etiquetar los proyectos
          // agregados de su columna, ver proyectosAgregados().
          rolesPropios: new Map(info.proyectos.map((pp) => [pp.proyecto_id, pp.rol])),
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

// Junta los `.proyectos` de varias personas (los reportes de un mismo
// supervisor) en un solo listado, uno por `proyecto_id` — para mostrar
// PROYECTOS en vez de PERSONAS dentro de una columna. Los entregables no se
// duplican (cada uno tiene un solo responsable), pero una reunión sí puede
// repetirse si varios reportes están invitados a la misma — se deduplica
// por id de reunión al juntar.
function proyectosAgregados(personas, rolesPropios) {
  const porProyecto = new Map();

  for (const persona of personas) {
    for (const p of persona.proyectos) {
      if (!porProyecto.has(p.proyecto_id)) {
        porProyecto.set(p.proyecto_id, {
          proyecto_id: p.proyecto_id,
          proyecto_nombre: p.proyecto_nombre,
          entregables: [],
          reunionesPorId: new Map(),
        });
      }
      const entrada = porProyecto.get(p.proyecto_id);
      entrada.entregables.push(...p.entregables);
      for (const r of p.reuniones) entrada.reunionesPorId.set(r.id, r);
    }
  }

  return Array.from(porProyecto.values()).map((e) => ({
    proyecto_id: e.proyecto_id,
    proyecto_nombre: e.proyecto_nombre,
    // El rol de cada reporte individual se pierde al fusionar (pueden ser
    // distintos entre sí), pero el rol del SUPERVISOR de esta columna en
    // este proyecto sí es un solo valor conocido — se muestra ese en vez
    // de dejarlo vacío (bug real: la columna de un supervisor nunca
    // mostraba "(Líder)" aunque sí lo fuera, ver armarColumnasEquipo).
    rol: rolesPropios?.get(e.proyecto_id) ?? null,
    entregables: e.entregables,
    reuniones: Array.from(e.reunionesPorId.values()),
  }));
}

// Arma las columnas de "Tu equipo" desde el punto de vista de QUIEN VE LA
// PANTALLA (usuarioActualId), con una regla única — sin distinguir N1/N2 a
// propósito, para que la vista se ajuste sola conforme cambien personas o
// proyectos. Todas las columnas terminan con la MISMA forma
// ({usuario_id, nombre, puesto, proyectos}) — el contenido siempre son
// proyectos (con sus entregables/reuniones), nunca una lista de personas:
//   - agruparPorSupervisor ya arma una columna por cada supervisor
//     encontrado en los datos, incluyendo al propio usuarioActualId si
//     supervisa a alguien (ej. David supervisando a Ana/Iván/Juan) — en ese
//     caso, `proyectosAgregados` junta los proyectos de TODOS sus reportes
//     en una sola columna con el nombre del supervisor (ej. Bernardo ve una
//     columna "David" con los proyectos Cubo/Suit/Agenda Inteligente, no
//     los nombres de Ana/Iván/Juan).
//   - Esa columna propia (la de quien ve la pantalla) NUNCA se muestra tal
//     cual (nadie necesita verse a sí mismo como encabezado de columna): en
//     vez de eso, cada uno de sus reportes se "promueve" a su propia
//     columna con SUS proyectos — a menos que ese reporte YA tenga columna
//     propia porque él mismo supervisa a alguien más visible aquí, en cuyo
//     caso se deja esa columna más completa y no se duplica.
//   - Cualquier persona visible para el viewer que NO quede cubierta por
//     ninguna columna de supervisor (ni como supervisor, ni como reporte de
//     alguien) también obtiene su propia columna con sus propios proyectos
//     — aunque estén vacíos. Este es el caso de alguien de nivel par (ej.
//     Jasso/Diana desde la vista de Bernardo) que no supervisa a nadie ni
//     tiene supervisor asignado, pero sigue siendo parte del equipo visible
//     — sin esto, esa persona simplemente desaparecía del tablero en vez de
//     mostrarse vacía (bug real encontrado el 2026-08-14: al quitarle sus
//     únicos reportes de demo, Jasso/Diana dejaron de generar columna).
//   - Si al final no queda ninguna columna (nadie más es visible, ej.
//     un N3/N4 viendo su propio tablero), se cae a una columna con el
//     propio usuario y sus proyectos.
export function armarColumnasEquipo(miembros, usuarioActualId) {
  const supervisores = agruparPorSupervisor(miembros);

  const propios = supervisores.find((s) => s.usuario_id === usuarioActualId);
  const columnas = supervisores
    .filter((s) => s.usuario_id !== usuarioActualId)
    .map((s) => ({
      usuario_id: s.usuario_id,
      nombre: s.nombre,
      puesto: s.puesto,
      proyectos: proyectosAgregados(s.reportes, s.rolesPropios),
    }));

  // Cobertura de OTROS supervisores (nunca del propio grupo del viewer —
  // ese se resuelve aparte abajo, promoviendo cada reporte a su columna
  // individual): evita duplicar a alguien que ya aparece agregado dentro
  // de la columna de otro supervisor.
  const idsCubiertos = new Set(columnas.map((c) => c.usuario_id));
  for (const s of supervisores) {
    if (s.usuario_id === usuarioActualId) continue;
    for (const r of s.reportes) idsCubiertos.add(r.usuario_id);
  }

  if (propios) {
    for (const reporte of propios.reportes) {
      if (idsCubiertos.has(reporte.usuario_id)) continue;
      columnas.push({
        usuario_id: reporte.usuario_id,
        nombre: reporte.nombre,
        puesto: reporte.puesto,
        proyectos: reporte.proyectos,
      });
      idsCubiertos.add(reporte.usuario_id);
    }
  }

  for (const m of miembros) {
    if (m.usuario_id === usuarioActualId) continue;
    if (idsCubiertos.has(m.usuario_id)) continue;
    columnas.push({
      usuario_id: m.usuario_id,
      nombre: m.nombre,
      puesto: m.puesto,
      proyectos: m.proyectos,
    });
    idsCubiertos.add(m.usuario_id);
  }

  if (columnas.length === 0) {
    const yo = miembros.find((m) => m.usuario_id === usuarioActualId);
    if (yo && yo.proyectos.length > 0) {
      columnas.push({
        usuario_id: yo.usuario_id,
        nombre: yo.nombre,
        puesto: yo.puesto,
        proyectos: yo.proyectos,
      });
    }
  }

  return columnas;
}

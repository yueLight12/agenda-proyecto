import { api } from "./client";

export const authApi = {
  login: async (email, password) => {
    // El backend usa OAuth2PasswordRequestForm: espera form-data, no JSON
    const form = new URLSearchParams();
    form.append("username", email);
    form.append("password", password);
    const { data } = await api.post("/auth/login", form, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    return data; // { access_token, token_type }
  },
  perfil: async () => {
    const { data } = await api.get("/auth/me");
    return data;
  },
  cambiarPassword: async (passwordActual, passwordNueva) =>
    api.post("/auth/cambiar-password", {
      password_actual: passwordActual,
      password_nueva: passwordNueva,
    }),
};

export const proyectosApi = {
  listar: async () => (await api.get("/proyectos")).data,
  // `datos.al_frente: true` crea el tema con prioridad 1 (arriba de todo)
  // en vez de al final -- ver alta rápida en Vista Equipo.
  crear: async (datos) => (await api.post("/proyectos", datos)).data,
  obtener: async (id) => (await api.get(`/proyectos/${id}`)).data,
  actualizar: async (id, datos) => (await api.patch(`/proyectos/${id}`, datos)).data,
  eliminar: async (id) => api.delete(`/proyectos/${id}`),
  resumen: async (id) => (await api.get(`/proyectos/${id}/resumen`)).data,
  equipo: async (id) => (await api.get(`/proyectos/${id}/usuarios`)).data,
  asignarRol: async (proyectoId, datos) =>
    (await api.post(`/proyectos/${proyectoId}/usuarios`, datos)).data,
  quitarMiembro: async (proyectoId, usuarioId) =>
    api.delete(`/proyectos/${proyectoId}/usuarios/${usuarioId}`),
  hijos: async (id) => (await api.get(`/proyectos/${id}/hijos`)).data,
  ancestros: async (id) => (await api.get(`/proyectos/${id}/ancestros`)).data,
  resumenSubarbol: async (id) => (await api.get(`/proyectos/${id}/resumen-subarbol`)).data,
  mover: async (id, nuevoParentId) =>
    (await api.patch(`/proyectos/${id}/mover`, { nuevo_parent_id: nuevoParentId })).data,
  // Distinto de `mover` (que reasigna a otro padre): reordena entre
  // hermanos del mismo padre, para el orden de importancia de Vista Equipo.
  reordenar: async (id, direccion) => api.post(`/proyectos/${id}/reordenar`, { direccion }),
  arbolVisible: async () => (await api.get("/proyectos/arbol-visible")).data,
  // Devuelve (creándolo si hace falta) el tema personal "Tareas sueltas"
  // del responsable dado (o el propio usuario si se omite) -- para crear un
  // entregable sin elegir tema (2026-08-20, a petición de Yue). Ver
  // ModalAsignarTareaRapida.jsx.
  tareasSueltas: async (responsableId) =>
    (await api.post("/proyectos/tareas-sueltas", { responsable_id: responsableId ?? null })).data,
  // Todas las personas con rol N1/N2 en algún tema, cruzando toda la
  // organización (2026-08-20, a petición de Yue) -- para reasignar una
  // tarea a "otro líder de otra área" sin depender de que ya participe en
  // este mismo tema. Ver FormularioEntregable.jsx.
  lideres: async () => (await api.get("/proyectos/lideres")).data,
};

export const entregablesApi = {
  listarPorProyecto: async (proyectoId) =>
    (await api.get(`/proyectos/${proyectoId}/entregables`)).data,
  crear: async (proyectoId, datos) =>
    (await api.post(`/proyectos/${proyectoId}/entregables`, datos)).data,
  actualizar: async (entregableId, datos) =>
    (await api.patch(`/entregables/${entregableId}`, datos)).data,
  actualizarAvance: async (entregableId, porcentaje_avance) =>
    (await api.patch(`/entregables/${entregableId}/avance`, { porcentaje_avance })).data,
  mover: async (entregableId, direccion) =>
    (await api.patch(`/entregables/${entregableId}/mover`, { direccion })).data,
  historial: async (entregableId) =>
    (await api.get(`/entregables/${entregableId}/historial`)).data,
  eliminar: async (entregableId) => api.delete(`/entregables/${entregableId}`),
  reasignar: async (entregableId, nuevoResponsableId, nota = null) =>
    (
      await api.patch(`/entregables/${entregableId}/reasignar`, {
        nuevo_responsable_id: nuevoResponsableId,
        nota,
      })
    ).data,
  // "Visto bueno" (2026-09-03) -- aprobar/rechazar un entregable marcado
  // al 100%. Rechazar exige una nota con el motivo.
  aprobar: async (entregableId) => (await api.patch(`/entregables/${entregableId}/aprobar`)).data,
  rechazar: async (entregableId, nota) =>
    (await api.patch(`/entregables/${entregableId}/rechazar`, { nota })).data,
  // Comprobante (imagen) requerido antes de poder marcar 100% de avance
  // (2026-08-21, a petición de Yue) -- mismo patrón que notasApi.subirImagen
  // / notasApi.imagenBlobUrl.
  subirComprobante: async (entregableId, archivo) => {
    const form = new FormData();
    form.append("archivo", archivo);
    return (
      await api.post(`/entregables/${entregableId}/comprobante`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
    ).data;
  },
  comprobanteBlobUrl: async (entregableId) => {
    const { data } = await api.get(`/entregables/${entregableId}/comprobante`, {
      responseType: "blob",
    });
    return URL.createObjectURL(data);
  },
};

export const dashboardApi = {
  resumen: async () => (await api.get("/dashboard/resumen")).data,
};

export const equipoResumenApi = {
  resumen: async () => (await api.get("/equipo/resumen")).data,
  misJefes: async () => (await api.get("/equipo/mis-jefes")).data,
  pendientesRevision: async () => (await api.get("/equipo/pendientes-revision")).data,
  temasResueltos: async () => (await api.get("/equipo/temas-resueltos")).data,
  historialSemana: async (fechaIso) =>
    (await api.get("/equipo/historial-semana", { params: { fecha: fechaIso } })).data,
};

export const reunionesApi = {
  listarPorProyecto: async (proyectoId) =>
    (await api.get(`/proyectos/${proyectoId}/reuniones`)).data,
  listarGenerales: async () => (await api.get("/reuniones")).data,
  obtener: async (reunionId) => (await api.get(`/reuniones/${reunionId}`)).data,
  crear: async (proyectoId, datos) =>
    proyectoId
      ? (await api.post(`/proyectos/${proyectoId}/reuniones`, datos)).data
      : (await api.post("/reuniones", datos)).data,
  actualizar: async (reunionId, datos) =>
    (await api.patch(`/reuniones/${reunionId}`, datos)).data,
  eliminar: async (reunionId) => api.delete(`/reuniones/${reunionId}`),
  // A quién se puede invitar -- más permisiva que proyectosApi.equipo, ver
  // services/reuniones.py::listar_invitables_reunion. proyectoId puede
  // omitirse (junta/reunión general).
  agenda: async (reunionId) => (await api.get(`/reuniones/${reunionId}/agenda`)).data,
  agregarItemAgenda: async (reunionId, datos) =>
    (await api.post(`/reuniones/${reunionId}/agenda`, datos)).data,
  invitables: async (proyectoId) =>
    (await api.get("/reuniones/invitables", { params: { proyecto_id: proyectoId } })).data,
  actualizarTemas: async (reunionId, proyectoIds) =>
    api.put(`/reuniones/${reunionId}/temas`, { proyecto_ids: proyectoIds }),
  temasRelevantes: async (reunionId) =>
    (await api.get(`/reuniones/${reunionId}/temas-relevantes`)).data,
  actualizarAsistencia: async (reunionId, usuarioId, asistio) =>
    (await api.patch(`/reuniones/${reunionId}/participantes/${usuarioId}/asistencia`, { asistio })).data,
};

export const usuariosApi = {
  listar: async () => (await api.get("/usuarios")).data,
  perfil: async (usuarioId) => (await api.get(`/usuarios/${usuarioId}/perfil`)).data,
  actualizarMiTelefono: async (telefonoWhatsapp) =>
    (await api.patch("/usuarios/me", { telefono_whatsapp: telefonoWhatsapp })).data,
  crear: async (datos) => (await api.post("/usuarios", datos)).data,
  actualizar: async (usuarioId, datos) => (await api.patch(`/usuarios/${usuarioId}`, datos)).data,
  eliminar: async (usuarioId) => api.delete(`/usuarios/${usuarioId}`),
};

export const adminApi = {
  reasignarTodo: async (origenId, destinoId) =>
    (await api.post("/admin/reasignar", { origen_id: origenId, destino_id: destinoId })).data,
  obtenerConfiguracion: async () => (await api.get("/admin/configuracion")).data,
  actualizarConfiguracion: async (clave, valor) =>
    (await api.put("/admin/configuracion", { clave, valor })).data,
  obtenerAuditoria: async () => (await api.get("/admin/auditoria")).data,
  obtenerActividad: async () => (await api.get("/admin/actividad")).data,
  obtenerIntentosFallidos: async () => (await api.get("/admin/intentos-fallidos")).data,
  verComo: async (usuarioId) => (await api.post(`/admin/ver-como/${usuarioId}`)).data,
  obtenerOrganigrama: async () => (await api.get("/admin/organigrama")).data,
  asignarEnOrganigrama: async (jefeId, usuarioId, rol) =>
    api.post("/admin/organigrama/asignar", { jefe_id: jefeId, usuario_id: usuarioId, rol }),
  quitarDeOrganigrama: async (jefeId, usuarioId) =>
    api.delete(`/admin/organigrama/asignar/${jefeId}/${usuarioId}`),
  obtenerTerminosSensibles: async () => (await api.get("/admin/terminos-sensibles")).data,
  agregarTerminoSensible: async (texto) =>
    (await api.post("/admin/terminos-sensibles", { texto })).data,
  quitarTerminoSensible: async (id) => api.delete(`/admin/terminos-sensibles/${id}`),
};

export const preferenciasApi = {
  obtener: async () => (await api.get("/usuarios/me/preferencias")).data,
  actualizar: async (datos) => (await api.patch("/usuarios/me/preferencias", datos)).data,
};

export const miEquipoApi = {
  listar: async () => (await api.get("/mi-equipo")).data,
  listarDe: async (usuarioId) => (await api.get(`/mi-equipo/${usuarioId}/equipo`)).data,
  listarUsuariosDisponibles: async () => (await api.get("/mi-equipo/usuarios-disponibles")).data,
  agregar: async (datos) => (await api.post("/mi-equipo", datos)).data,
  agregarPersonaNueva: async (datos) => (await api.post("/mi-equipo/nueva-persona", datos)).data,
  quitar: async (usuarioId) => api.delete(`/mi-equipo/${usuarioId}`),
  aplicarAProyecto: async (proyectoId) =>
    (await api.post(`/proyectos/${proyectoId}/aplicar-mi-equipo`)).data,
};

export const rendimientoApi = {
  obtener: async (periodo, proyectoId) =>
    (await api.get("/rendimiento", { params: { periodo, proyecto_id: proyectoId } })).data,
  obtenerResumen: async (proyectoId) =>
    (await api.get("/rendimiento/resumen", { params: { proyecto_id: proyectoId } })).data,
  obtenerAprobacion: async (periodo, proyectoId) =>
    (await api.get("/rendimiento/aprobacion", { params: { periodo, proyecto_id: proyectoId } }))
      .data,
  obtenerActividad: async (periodo, proyectoId) =>
    (await api.get("/rendimiento/actividad", { params: { periodo, proyecto_id: proyectoId } }))
      .data,
  descargarReportePdf: async (periodo, proyectoId) =>
    (
      await api.get("/rendimiento/reporte-pdf", {
        params: { periodo, proyecto_id: proyectoId },
        responseType: "blob",
      })
    ).data,
};

export const minutasApi = {
  obtener: async (reunionId) => (await api.get(`/reuniones/${reunionId}/minuta`)).data,
  guardar: async (reunionId, contenido) =>
    (await api.post(`/reuniones/${reunionId}/minuta`, { contenido })).data,
  agregarAcuerdo: async (minutaId, datos) =>
    (await api.post(`/minutas/${minutaId}/acuerdos`, datos)).data,
  eliminarAcuerdo: async (acuerdoId) => api.delete(`/acuerdos/${acuerdoId}`),
  convertirAcuerdo: async (acuerdoId, datos) =>
    (await api.post(`/acuerdos/${acuerdoId}/convertir-a-entregable`, datos)).data,
  registrarRevisionAgendaItem: async (reunionId, itemId, datos) =>
    (await api.post(`/reuniones/${reunionId}/agenda-items/${itemId}/revision`, datos)).data,
};

export const seriesReunionApi = {
  listar: async (proyectoId) =>
    (await api.get("/series-reuniones", { params: { proyecto_id: proyectoId } })).data,
  crear: async (datos) => (await api.post("/series-reuniones", datos)).data,
  actualizar: async (serieId, datos) =>
    (await api.patch(`/series-reuniones/${serieId}`, datos)).data,
  eliminar: async (serieId, eliminarOcurrencias = false) =>
    api.delete(`/series-reuniones/${serieId}`, { params: { eliminar_ocurrencias: eliminarOcurrencias } }),
  agenda: async (serieId) => (await api.get(`/series-reuniones/${serieId}/agenda`)).data,
  agregarItemAgenda: async (serieId, datos) =>
    (await api.post(`/series-reuniones/${serieId}/agenda`, datos)).data,
  editarItemAgenda: async (itemId, datos) =>
    (await api.patch(`/series-reuniones/agenda-items/${itemId}`, datos)).data,
  moverItemAgenda: async (itemId, direccion) =>
    (await api.post(`/series-reuniones/agenda-items/${itemId}/mover`, { direccion })).data,
  archivarItemAgenda: async (itemId) => api.delete(`/series-reuniones/agenda-items/${itemId}`),
  revertirRevisado: async (itemId) => api.post(`/series-reuniones/agenda-items/${itemId}/revertir-revisado`),
  actualizarTemas: async (serieId, proyectoIds) =>
    api.put(`/series-reuniones/${serieId}/temas`, { proyecto_ids: proyectoIds }),
  temasRelevantes: async (serieId) =>
    (await api.get(`/series-reuniones/${serieId}/temas-relevantes`)).data,
};

export const eventosEmpresaApi = {
  listar: async () => (await api.get("/eventos-empresa")).data,
};

export const notasApi = {
  // params: { entregable_id } | { reunion_id } | { minuta_id } (uno solo)
  listar: async (params) => (await api.get("/notas", { params })).data,
  crear: async (datos) => (await api.post("/notas", datos)).data,
  eliminar: async (notaId) => api.delete(`/notas/${notaId}`),
  subirImagen: async (notaId, archivo) => {
    const form = new FormData();
    form.append("archivo", archivo);
    return (
      await api.post(`/notas/${notaId}/imagen`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
    ).data;
  },
  // Devuelve un object URL (blob) listo para <img src>, no la URL directa
  // del endpoint -- ese exige el header Authorization (JWT), que un <img>
  // plano no manda; quien lo use debe liberar la URL con
  // URL.revokeObjectURL al desmontar.
  imagenBlobUrl: async (notaId) => {
    const { data } = await api.get(`/notas/${notaId}/imagen`, { responseType: "blob" });
    return URL.createObjectURL(data);
  },
};

export const pendientesApi = {
  listar: async (params) => (await api.get("/pendientes", { params })).data,
  crear: async (datos) => (await api.post("/pendientes", datos)).data,
  eliminar: async (pendienteId) => api.delete(`/pendientes/${pendienteId}`),
};

export const pendientesPersonalesApi = {
  listar: async () => (await api.get("/pendientes-personales")).data,
  crear: async (datos) => (await api.post("/pendientes-personales", datos)).data,
  actualizar: async (id, datos) => (await api.patch(`/pendientes-personales/${id}`, datos)).data,
  eliminar: async (id) => api.delete(`/pendientes-personales/${id}`),
};

export const acuerdosApi = {
  listarPorProyecto: async (proyectoId) =>
    (await api.get(`/proyectos/${proyectoId}/acuerdos`)).data,
};

export const chatbotApi = {
  consultar: async (pregunta) =>
    (await api.post("/chatbot/consulta", { pregunta }, { timeout: 150000 })).data,
};

export const asistenteApi = {
  transcribir: async (blob) => {
    const form = new FormData();
    form.append("audio", blob, "audio.webm");
    const { data } = await api.post("/asistente/transcribir", form, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 60000,
    });
    return data; // { texto }
  },
  interpretar: async (payload) =>
    (await api.post("/asistente/interpretar", payload, { timeout: 60000 })).data,
  confirmar: async (payload) => (await api.post("/asistente/confirmar", payload)).data,
  cancelar: async (payload) => api.post("/asistente/cancelar", payload),
};

export const notificacionesApi = {
  listar: async (soloNoLeidas = false) =>
    (await api.get(`/notificaciones`, { params: { solo_no_leidas: soloNoLeidas } })).data,
  marcarLeida: async (id) => (await api.patch(`/notificaciones/${id}`)).data,
  eliminar: async (id) => api.delete(`/notificaciones/${id}`),
};

export const mensajesDirectosApi = {
  // A quién le puedes escribir -- mismo criterio que a quién puedes
  // invitar a una reunión general (ver reuniones.py::listar_invitables_reunion).
  contactos: async () => (await api.get("/mensajes-directos/contactos")).data,
  resumen: async () => (await api.get("/mensajes-directos/resumen")).data,
  conversacion: async (otroId) => (await api.get(`/mensajes-directos/con/${otroId}`)).data,
  enviar: async (otroId, contenido) =>
    (await api.post(`/mensajes-directos/con/${otroId}`, { contenido })).data,
  marcarLeido: async (otroId) => api.patch(`/mensajes-directos/con/${otroId}/leido`),
};

export const pushApi = {
  vapidPublicKey: async () => (await api.get("/push/vapid-public-key")).data,
  suscribir: async (datos) => (await api.post("/push/suscribir", datos)).data,
  desuscribir: async (endpoint) => api.delete("/push/suscribir", { data: { endpoint } }),
};

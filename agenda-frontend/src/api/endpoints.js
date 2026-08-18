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
  arbolVisible: async () => (await api.get("/proyectos/arbol-visible")).data,
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
  historial: async (entregableId) =>
    (await api.get(`/entregables/${entregableId}/historial`)).data,
  eliminar: async (entregableId) => api.delete(`/entregables/${entregableId}`),
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
};

export const usuariosApi = {
  listar: async () => (await api.get("/usuarios")).data,
  perfil: async (usuarioId) => (await api.get(`/usuarios/${usuarioId}/perfil`)).data,
};

export const miEquipoApi = {
  listar: async () => (await api.get("/mi-equipo")).data,
  agregar: async (datos) => (await api.post("/mi-equipo", datos)).data,
  agregarPersonaNueva: async (datos) => (await api.post("/mi-equipo/nueva-persona", datos)).data,
  quitar: async (usuarioId) => api.delete(`/mi-equipo/${usuarioId}`),
  aplicarAProyecto: async (proyectoId) =>
    (await api.post(`/proyectos/${proyectoId}/aplicar-mi-equipo`)).data,
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

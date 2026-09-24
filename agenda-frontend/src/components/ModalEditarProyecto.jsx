import { useEffect, useState } from "react";
import { equipoResumenApi, miEquipoApi, proyectosApi } from "../api/endpoints";
import { useAuth } from "../context/AuthContext";
import BuscadorInvitados from "./BuscadorInvitados";
import Modal from "./Modal";

// `proyecto` es opcional: si no viene, el modal entra en modo creación
// (mismo patrón de modal que el resto del sistema — antes "Crear proyecto"
// era el único "crear" que usaba un acordeón inline en vez de un modal).
// `parentId` (solo aplica en modo creación) crea un SUBTEMA dentro de ese
// nodo en vez de un proyecto/tema raíz (ver Fase 1 de jerarquía, 2026-08-16).
//
// 2026-09-21, a petición de Yue tras un bug real (Beatriz Saavedra: creó
// proyectos nuevos y no tenía ninguna forma de agregarles gente, porque
// "Mis proyectos" dejó de enlazar a TableroProyecto.jsx -- la única
// pantalla con el panel completo de roles/supervisor -- desde 2026-09-18).
// Un primer intento reusó ese panel completo (ModalEquipo.jsx) desde aquí,
// pero Yue lo vio "muy complejo" y pidió simplificar: CREAR y EDITAR se ven
// IGUAL (mismo formulario), con un solo campo "Participantes" que agrega
// varias personas de una vez, con el mismo buscador tipo Teams que ya se
// usa para invitar gente a una reunión (BuscadorInvitados.jsx) -- en vez
// del panel de roles/supervisor/Kanban de equipo completo.
//
// El rol de cada participante se resuelve solo, tomando lo que ya tiene
// guardado en tu "Mi equipo" (N2/N3/N4) -- mismo criterio que ya usaba la
// "persona a cargo" de antes (ver comentario más abajo, bug real
// 2026-09-17: "Comprobaciones 2025", Beatriz/Judith, por quedar siempre
// como N2 sin supervisor). Si alguien no está en tu "Mi equipo" guardado,
// no aparece como candidato -- para agregar a alguien nuevo a la
// organización, primero se guarda en "Equipo" (mismo requisito que ya
// tenía el selector de "persona a cargo").
//
// `onEliminar` (2026-09-18, solo lo pasa ListaProyectos.jsx) -- cuando viene
// y estamos en modo edición, se muestra un botón "Eliminar" junto a
// "Guardar cambios" -- también para proyectos RAÍZ (2026-09-24, a petición
// de Yue: el backend ya lo permitía, solo la UI lo restringía a subtemas
// antes de esto). La confirmación/aviso de qué se borra vive en quien
// llama (ver ListaProyectos.jsx, ya distingue "tiene subtemas" o no para el
// texto de advertencia), este modal solo dispara el callback con el
// proyecto actual.
export default function ModalEditarProyecto({ proyecto = null, parentId = null, onGuardado, onCerrar, onEliminar }) {
  const { usuario: usuarioActual } = useAuth();
  const esEdicion = Boolean(proyecto);
  const [nombre, setNombre] = useState(proyecto?.nombre || "");
  const [descripcion, setDescripcion] = useState(proyecto?.descripcion || "");
  const [activo, setActivo] = useState(proyecto?.activo ?? true);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const [miEquipo, setMiEquipo] = useState([]);
  const [errorMiEquipo, setErrorMiEquipo] = useState("");
  const [cargandoParticipantes, setCargandoParticipantes] = useState(esEdicion);

  // Participantes elegidos AHORA (se muestran como chips, igual que
  // invitados de una reunión) -- en modo edición arranca con quienes ya
  // están en el proyecto (intersección con tu "Mi equipo": solo se puede
  // agregar/quitar gente que ya tienes guardada ahí, mismo límite que el
  // resto del sistema para este flujo simplificado). `idsOriginales` guarda
  // esa foto inicial para poder calcular, al guardar, a quién agregar y a
  // quién quitar -- sin eso habría que reconstruir el diff comparando con
  // el equipo real del proyecto otra vez.
  const [participantesIds, setParticipantesIds] = useState([]);
  const [idsOriginales, setIdsOriginales] = useState([]);

  // "Nuevo subtema" desde aquí mismo (2026-09-23, a petición de Yue tras
  // encontrar que no había forma de llegar a crear un subtema: desde el
  // rediseño de "Mis proyectos" (2026-09-18, ver FilaProyecto.jsx) la fila
  // de un proyecto abre este modal de edición en vez de navegar a
  // TableroProyecto.jsx -- que es donde vivía el único botón "Nuevo
  // subtema" -- dejando esa pantalla, y ese botón, inalcanzables desde el
  // flujo normal. Se resuelve montando OTRO ModalEditarProyecto encima,
  // con parentId=proyecto.id (modo creación de subtema); al guardar, se
  // cierra el anidado y se reusa el mismo onGuardado de este modal (misma
  // recarga/cierre que ya dispara "Guardar cambios").
  const [mostrarNuevoSubtema, setMostrarNuevoSubtema] = useState(false);

  useEffect(() => {
    let cancelado = false;
    Promise.all([miEquipoApi.listar(), equipoResumenApi.misJefes().catch(() => [])])
      .then(async ([equipoPropio, jefes]) => {
        if (cancelado) return;
        // Jefes (2026-09-24, a petición de Yue: "Delia es subordinada de
        // Jasso, si Delia quiere crear un proyecto con Jasso no puede" --
        // antes el buscador solo incluía "Mi equipo" propio, nunca a quien
        // te supervisa a TI). Se agregan como candidatos más, con la misma
        // forma que espera BuscadorInvitados (usuario_id/nombre/puesto/rol) --
        // JefeOut no trae rol/puesto, se dejan vacíos, solo importan para
        // mostrarlos en la lista y poder elegirlos.
        const idsPropios = new Set(equipoPropio.map((m) => m.usuario_id));
        const jefesComoCandidatos = jefes
          .filter((j) => !idsPropios.has(j.id))
          .map((j) => ({ usuario_id: j.id, nombre: j.nombre, puesto: null, rol: null }));
        const equipo = [...equipoPropio, ...jefesComoCandidatos];
        setMiEquipo(equipo);
        if (esEdicion) {
          const miembrosProyecto = await proyectosApi.equipo(proyecto.id);
          if (cancelado) return;
          const idsEquipoProyecto = new Set(miembrosProyecto.map((m) => m.usuario_id));
          const idsIniciales = equipo
            .map((m) => m.usuario_id)
            .filter((id) => idsEquipoProyecto.has(id));
          setParticipantesIds(idsIniciales);
          setIdsOriginales(idsIniciales);
        }
      })
      .catch(() => setErrorMiEquipo("No se pudo cargar tu equipo guardado."))
      .finally(() => {
        if (!cancelado) setCargandoParticipantes(false);
      });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rolYSupervisorPara = (usuarioId) => {
    const m = miEquipo.find((x) => x.usuario_id === usuarioId);
    if (!m?.rol) {
      // Sin rol guardado = viene de la lista de jefes, no de "Mi equipo"
      // (2026-09-24) -- se agrega como líder (N2) de este proyecto, SIN
      // supervisor_id: usuarioActual no puede figurar como supervisor de su
      // propio jefe. Mismo criterio que ya usa reasignar_entregable al
      // agregar a alguien fuera de "Mi equipo".
      return { rol: "N2", supervisor_id: null };
    }
    const rol = m.rol;
    return { rol, supervisor_id: ["N3", "N4"].includes(rol) ? usuarioActual.id : null };
  };

  const handleGuardar = async (e) => {
    e.preventDefault();
    setError("");
    setGuardando(true);
    try {
      if (esEdicion) {
        await proyectosApi.actualizar(proyecto.id, {
          nombre,
          descripcion: descripcion || null,
          activo,
        });
        const agregados = participantesIds.filter((id) => !idsOriginales.includes(id));
        const quitados = idsOriginales.filter((id) => !participantesIds.includes(id));
        await Promise.all([
          ...agregados.map((id) =>
            proyectosApi.asignarRol(proyecto.id, { usuario_id: id, ...rolYSupervisorPara(id) })
          ),
          ...quitados.map((id) => proyectosApi.quitarMiembro(proyecto.id, id)),
        ]);
      } else {
        const nuevo = await proyectosApi.crear({ nombre, descripcion: descripcion || null, parent_id: parentId });
        await Promise.all(
          participantesIds.map((id) =>
            proyectosApi.asignarRol(nuevo.id, { usuario_id: id, ...rolYSupervisorPara(id) })
          )
        );
      }
      await onGuardado();
    } catch (err) {
      setError(err.response?.data?.detail || "No se pudo guardar el proyecto.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      titulo={esEdicion ? "Editar proyecto" : parentId ? "Nuevo subtema" : "Crear proyecto"}
      onCerrar={onCerrar}
    >
      <form className="stack" onSubmit={handleGuardar}>
        <label className="stack" style={{ gap: 4 }}>
          <span style={{ fontSize: "0.85rem" }}>Nombre del proyecto</span>
          <input
            className="input"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
          />
        </label>
        <label className="stack" style={{ gap: 4 }}>
          <span style={{ fontSize: "0.85rem" }}>Descripción (opcional)</span>
          <input
            className="input"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
          />
        </label>
        {esEdicion && (
          <label className="list-inline" style={{ borderBottom: "none", paddingBottom: 0 }}>
            <span style={{ fontSize: "0.85rem" }}>Proyecto activo</span>
            <input
              type="checkbox"
              checked={activo}
              onChange={(e) => setActivo(e.target.checked)}
            />
          </label>
        )}

        {esEdicion && proyecto.creado_por_nombre && (
          <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
            Creó: {proyecto.creado_por_nombre}
          </p>
        )}

        <div className="stack" style={{ gap: 4 }}>
          <span style={{ fontSize: "0.85rem" }}>Participantes (opcional)</span>
          <span style={{ color: "var(--color-text-muted)", fontSize: "0.78rem" }}>
            Gente de tu equipo guardado ("Equipo") o tu(s) jefe(s). Si dejas esto vacío, quedarás tú a cargo.
          </span>
          {errorMiEquipo && <p className="error-text">{errorMiEquipo}</p>}
          {!errorMiEquipo && cargandoParticipantes && (
            <p style={{ color: "var(--color-text-muted)", fontSize: "0.78rem" }}>Cargando...</p>
          )}
          {!errorMiEquipo && !cargandoParticipantes && (
            <BuscadorInvitados
              candidatos={miEquipo}
              seleccionadosIds={participantesIds}
              onCambiar={setParticipantesIds}
            />
          )}
        </div>

        {error && <p className="error-text">{error}</p>}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn--primary" type="submit" disabled={guardando}>
            {guardando ? "Guardando..." : esEdicion ? "Guardar cambios" : "Crear y cerrar"}
          </button>
          {esEdicion && (
            <button
              className="btn btn--ghost"
              type="button"
              onClick={() => setMostrarNuevoSubtema(true)}
            >
              Nuevo subtema
            </button>
          )}
          {esEdicion && onEliminar && (
            <button
              className="btn btn--ghost"
              type="button"
              style={{ color: "var(--color-danger)" }}
              onClick={() => onEliminar(proyecto)}
            >
              Eliminar
            </button>
          )}
        </div>
      </form>

      {mostrarNuevoSubtema && (
        <ModalEditarProyecto
          parentId={proyecto.id}
          onGuardado={async () => {
            setMostrarNuevoSubtema(false);
            await onGuardado();
          }}
          onCerrar={() => setMostrarNuevoSubtema(false)}
        />
      )}
    </Modal>
  );
}

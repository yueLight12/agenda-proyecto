import { useEffect, useState } from "react";
import { mensajesDirectosApi } from "../api/endpoints";
import { useAuth } from "../context/AuthContext";
import { colorAvatar, iniciales } from "../utils/avatarPersona";
import Modal from "./Modal";

// "Mensajes directos" (2026-09-19, a petición de Yue: "Iván le quiere
// pedir archivos a Juan, no tiene nada que ver con ningún proyecto" -- no
// existía ninguna forma de comunicarse persona a persona sin colgarlo de
// un entregable/reunión/proyecto compartido). Reusa las mismas clases CSS
// `planb__persona-*` que ya usan SelectorPersona.jsx/FilaProyecto.jsx --
// se ve igual en los 6 estilos visuales sin escribir CSS nuevo.
//
// Dos vistas dentro del mismo modal: "inbox" (conversaciones existentes +
// botón para empezar una nueva con alguien de tus contactos) y el hilo
// abierto con una persona. `contactoInicialId` (opcional) salta derecho al
// hilo con esa persona -- para abrir desde la campanita de notificaciones
// cuando el tipo es "mensaje_directo".
export default function ModalMensajesDirectos({ onCerrar, contactoInicialId = null }) {
  const { usuario } = useAuth();
  const [conversaciones, setConversaciones] = useState([]);
  const [contactos, setContactos] = useState([]);
  const [cargandoInbox, setCargandoInbox] = useState(true);
  const [error, setError] = useState("");

  const [conversacionAbierta, setConversacionAbierta] = useState(null); // { usuario_id, nombre }
  const [mensajes, setMensajes] = useState([]);
  const [cargandoHilo, setCargandoHilo] = useState(false);
  const [contenido, setContenido] = useState("");
  const [enviando, setEnviando] = useState(false);

  const [mostrarContactos, setMostrarContactos] = useState(false);
  const [busquedaContacto, setBusquedaContacto] = useState("");

  const cargarInbox = () => {
    setCargandoInbox(true);
    setError("");
    Promise.all([mensajesDirectosApi.resumen(), mensajesDirectosApi.contactos()])
      .then(([resumen, listaContactos]) => {
        setConversaciones(resumen);
        setContactos(listaContactos);
      })
      .catch(() => setError("No se pudieron cargar tus mensajes."))
      .finally(() => setCargandoInbox(false));
  };

  useEffect(cargarInbox, []);

  const abrirConversacion = async (persona) => {
    setError("");
    setMostrarContactos(false);
    setConversacionAbierta(persona);
    setCargandoHilo(true);
    try {
      const lista = await mensajesDirectosApi.conversacion(persona.usuario_id);
      setMensajes(lista);
      mensajesDirectosApi.marcarLeido(persona.usuario_id).catch(() => {});
      cargarInbox();
    } catch {
      setError("No se pudo abrir la conversación.");
    } finally {
      setCargandoHilo(false);
    }
  };

  useEffect(() => {
    if (contactoInicialId && contactos.length > 0) {
      const c = contactos.find((x) => x.usuario_id === contactoInicialId);
      if (c) abrirConversacion(c);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactoInicialId, contactos]);

  const handleEnviar = async (e) => {
    e.preventDefault();
    if (!contenido.trim() || !conversacionAbierta) return;
    setEnviando(true);
    setError("");
    try {
      const creado = await mensajesDirectosApi.enviar(conversacionAbierta.usuario_id, contenido.trim());
      setMensajes((prev) => [...prev, creado]);
      setContenido("");
    } catch (err) {
      setError(err.response?.data?.detail || "No se pudo enviar el mensaje.");
    } finally {
      setEnviando(false);
    }
  };

  const contactosFiltrados = contactos.filter((c) =>
    c.nombre.toLowerCase().includes(busquedaContacto.trim().toLowerCase())
  );

  // --- Vista: hilo abierto con una persona -------------------------------
  if (conversacionAbierta) {
    return (
      <Modal titulo={conversacionAbierta.nombre} onCerrar={onCerrar}>
        <div className="stack" style={{ gap: 8 }}>
          <button
            type="button"
            className="btn btn--ghost"
            style={{ alignSelf: "flex-start" }}
            onClick={() => setConversacionAbierta(null)}
          >
            ← Todos los mensajes
          </button>

          {cargandoHilo && <p>Cargando...</p>}
          {error && <p className="error-text">{error}</p>}

          {!cargandoHilo && (
            <div className="stack" style={{ gap: 6, maxHeight: 320, overflowY: "auto" }}>
              {mensajes.length === 0 && (
                <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
                  Todavía no hay mensajes -- escribe el primero abajo.
                </p>
              )}
              {mensajes.map((m) => {
                const esMio = m.autor_id === usuario?.id;
                return (
                  <div
                    key={m.id}
                    style={{
                      alignSelf: esMio ? "flex-end" : "flex-start",
                      maxWidth: "80%",
                      // Tokens reales del proyecto (ver src/styles/tokens.css) --
                      // "--color-primary"/"--color-surface-alt" no existen ahí,
                      // eran nombres inventados: sin fallback, el fondo del
                      // mensaje "mío" quedaba transparente con texto blanco,
                      // invisible sobre el fondo blanco del tema claro (solo se
                      // veía "por accidente" en el tema oscuro, bug real
                      // encontrado por Yue el 2026-09-19).
                      background: esMio ? "var(--color-teal-500)" : "var(--color-border)",
                      color: esMio ? "#fff" : "var(--color-text)",
                      borderRadius: 10,
                      padding: "6px 10px",
                    }}
                  >
                    <p style={{ margin: 0 }}>{m.contenido}</p>
                    <span style={{ fontSize: "0.7rem", opacity: 0.75 }}>
                      {new Date(m.fecha_creacion).toLocaleString("es-MX", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <form className="stack" style={{ gap: 6 }} onSubmit={handleEnviar}>
            <textarea
              className="input"
              rows={2}
              placeholder="Escribe un mensaje..."
              value={contenido}
              onChange={(e) => setContenido(e.target.value)}
            />
            <button
              className="btn btn--primary"
              type="submit"
              disabled={enviando || !contenido.trim()}
              style={{ alignSelf: "flex-start" }}
            >
              {enviando ? "Enviando..." : "Enviar"}
            </button>
          </form>
        </div>
      </Modal>
    );
  }

  // --- Vista: elegir a un contacto nuevo ----------------------------------
  if (mostrarContactos) {
    return (
      <Modal titulo="¿A quién le quieres escribir?" onCerrar={onCerrar}>
        <div className="stack">
          <button
            type="button"
            className="btn btn--ghost"
            style={{ alignSelf: "flex-start" }}
            onClick={() => setMostrarContactos(false)}
          >
            ← Volver
          </button>
          {contactos.length === 0 && (
            <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
              No tienes a nadie disponible para escribirle todavía -- necesitas compartir un
              proyecto con alguien, tenerlo en tu "Mi equipo", o compartir jefe con él.
            </p>
          )}
          {contactos.length > 0 && (
            <input
              className="input"
              type="search"
              placeholder="Buscar..."
              value={busquedaContacto}
              onChange={(e) => setBusquedaContacto(e.target.value)}
              aria-label="Buscar contacto"
            />
          )}
          {contactosFiltrados.map((c) => (
            <div key={c.usuario_id} className="planb__persona-fila-wrap">
              <button
                type="button"
                className="planb__persona-fila"
                onClick={() => abrirConversacion({ usuario_id: c.usuario_id, nombre: c.nombre })}
              >
                <span
                  className="planb__persona-avatar"
                  style={{ background: colorAvatar(c.nombre) }}
                  aria-hidden="true"
                >
                  {iniciales(c.nombre)}
                </span>
                <span className="planb__persona-datos">
                  <span className="planb__persona-nombre">{c.nombre}</span>
                  {c.puesto && <span className="planb__persona-puesto">{c.puesto}</span>}
                </span>
                <span className="planb__persona-elegir" aria-hidden="true">
                  Escribir
                </span>
              </button>
            </div>
          ))}
        </div>
      </Modal>
    );
  }

  // --- Vista: inbox (lista de conversaciones) -----------------------------
  return (
    <Modal titulo="Mensajes" onCerrar={onCerrar}>
      <div className="stack">
        <button
          type="button"
          className="btn btn--primary"
          style={{ alignSelf: "flex-start" }}
          onClick={() => setMostrarContactos(true)}
        >
          + Nuevo mensaje
        </button>

        {cargandoInbox && <p>Cargando...</p>}
        {error && <p className="error-text">{error}</p>}

        {!cargandoInbox && conversaciones.length === 0 && (
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
            Todavía no tienes ninguna conversación.
          </p>
        )}

        {conversaciones.map((c) => (
          <div key={c.usuario_id} className="planb__persona-fila-wrap">
            <button
              type="button"
              className="planb__persona-fila"
              onClick={() => abrirConversacion({ usuario_id: c.usuario_id, nombre: c.nombre })}
            >
              <span
                className="planb__persona-avatar"
                style={{ background: colorAvatar(c.nombre) }}
                aria-hidden="true"
              >
                {iniciales(c.nombre)}
              </span>
              <span className="planb__persona-datos">
                <span className="planb__persona-nombre">
                  {c.nombre}
                  {c.no_leidos > 0 && (
                    <span
                      style={{
                        marginLeft: 6,
                        background: "var(--color-danger)",
                        color: "#fff",
                        borderRadius: 999,
                        fontSize: "0.7rem",
                        padding: "1px 7px",
                      }}
                    >
                      {c.no_leidos}
                    </span>
                  )}
                </span>
                <span className="planb__persona-puesto">{c.ultimo_mensaje}</span>
              </span>
            </button>
          </div>
        ))}
      </div>
    </Modal>
  );
}

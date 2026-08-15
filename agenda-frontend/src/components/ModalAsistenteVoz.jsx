import { useRef, useState } from "react";
import { asistenteApi } from "../api/endpoints";
import useGrabadorAudio from "../hooks/useGrabadorAudio";
import VistaPreviaAccion from "./asistente/VistaPreviaAccion";
import Modal from "./Modal";

const FASES = {
  INICIO: "inicio",
  GRABANDO: "grabando",
  PROCESANDO: "procesando",
  ACLARANDO: "aclarando",
  CONFIRMANDO: "confirmando",
  EJECUTANDO: "ejecutando",
  RESULTADO: "resultado",
  ERROR: "error",
};

export default function ModalAsistenteVoz({ proyectoIdContexto, onCerrar }) {
  const { error: errorMic, iniciar, detener } = useGrabadorAudio();
  const [fase, setFase] = useState(FASES.INICIO);
  const [textoManual, setTextoManual] = useState("");
  const [mensaje, setMensaje] = useState("");

  // Estado de la conversación con /asistente/interpretar
  const [tool, setTool] = useState(null);
  const [parametrosLlm, setParametrosLlm] = useState(null);
  const [aclaraciones, setAclaraciones] = useState({});
  const [aclaracionActual, setAclaracionActual] = useState(null); // { campo, pregunta, tipo_entrada, opciones }
  const [propuesta, setPropuesta] = useState(null); // { tool, parametros, resumen, preview }
  const [respuestaTexto, setRespuestaTexto] = useState("");
  const [tipoResultado, setTipoResultado] = useState("accion"); // "accion" | "respuesta"

  // Instrucciones compuestas: cola de acciones de la misma instrucción que
  // todavía no se resuelven ({ tool, parametros_llm }), y el id de proyecto
  // "activo" para el resto de la cola — si la primera acción fue
  // crear_proyecto, las siguientes (ej. agregar líderes) deben aplicar sobre
  // ESE proyecto recién creado, no sobre el que estaba abierto en la app.
  const [accionesPendientes, setAccionesPendientes] = useState([]);
  const [proyectoIdContextoActivo, setProyectoIdContextoActivo] = useState(proyectoIdContexto || null);
  const [mensajesAcumulados, setMensajesAcumulados] = useState([]);
  // Acumulador mutable en paralelo al estado: cuando varias acciones de la
  // misma instrucción se encadenan automáticamente (sin que el usuario
  // interactúe entre medio, ej. varias tipo "respuesta" seguidas), el
  // closure de la función encadenada puede quedar con el `mensajesAcumulados`
  // de un render anterior — el ref siempre tiene el valor real y actual.
  const mensajesRef = useRef([]);

  const reiniciar = () => {
    setFase(FASES.INICIO);
    setTextoManual("");
    setMensaje("");
    setTool(null);
    setParametrosLlm(null);
    setAclaraciones({});
    setAclaracionActual(null);
    setPropuesta(null);
    setRespuestaTexto("");
    setTipoResultado("accion");
    setAccionesPendientes([]);
    setProyectoIdContextoActivo(proyectoIdContexto || null);
    setMensajesAcumulados([]);
    mensajesRef.current = [];
  };

  const manejarInterpretar = async (payload) => {
    setFase(FASES.PROCESANDO);
    try {
      const resp = await asistenteApi.interpretar(payload);
      setAccionesPendientes(resp.acciones_pendientes || []);
      if (resp.tipo === "propuesta") {
        setTool(resp.tool);
        setPropuesta({ tool: resp.tool, parametros: resp.parametros, resumen: resp.resumen, preview: resp.preview });
        setFase(FASES.CONFIRMANDO);
      } else if (resp.tipo === "aclaracion") {
        setTool(resp.tool);
        setParametrosLlm(resp.parametros_llm);
        setAclaracionActual({
          campo: resp.campo,
          pregunta: resp.pregunta,
          tipo_entrada: resp.tipo_entrada,
          opciones: resp.opciones || [],
        });
        setFase(FASES.ACLARANDO);
      } else if (resp.tipo === "respuesta") {
        await avanzarOTerminar(resp.mensaje, resp.acciones_pendientes || []);
      } else {
        setMensaje(resp.mensaje || "No entendí bien esa instrucción.");
        setFase(FASES.ERROR);
      }
    } catch (err) {
      setMensaje(err.response?.data?.detail || "No se pudo interpretar la instrucción.");
      setFase(FASES.ERROR);
    }
  };

  // Tras ejecutar/leer una acción, si quedan más acciones de la misma
  // instrucción compuesta, sigue automáticamente con la próxima en vez de
  // terminar aquí. `idProyectoNuevo` es el id devuelto por crear_proyecto,
  // si esta acción era esa.
  const avanzarOTerminar = async (mensajeAccion, colaRestante, idProyectoNuevo) => {
    mensajesRef.current = [...mensajesRef.current, mensajeAccion];
    setMensajesAcumulados(mensajesRef.current);

    const contextoParaSiguiente = idProyectoNuevo ?? proyectoIdContextoActivo;
    if (idProyectoNuevo) setProyectoIdContextoActivo(idProyectoNuevo);

    if (colaRestante.length > 0) {
      const [siguiente, ...resto] = colaRestante;
      setAccionesPendientes(resto);
      await manejarInterpretar({
        texto: "",
        proyecto_id_contexto: contextoParaSiguiente || null,
        tool: siguiente.tool,
        parametros_llm: siguiente.parametros_llm,
        aclaraciones: {},
        acciones_pendientes: resto,
      });
      return;
    }

    setRespuestaTexto(mensajesRef.current.join(" "));
    setTipoResultado("accion");
    setFase(FASES.RESULTADO);
  };

  const enviarTexto = async (texto) => {
    if (!texto.trim()) return;
    await manejarInterpretar({ texto, proyecto_id_contexto: proyectoIdContextoActivo || null });
  };

  // `alTranscribir` recibe el texto ya transcrito: enviarTexto() para la
  // instrucción inicial, responderAclaracion() para responder por voz una
  // pregunta de aclaración — mismo mecanismo de grabación en ambos casos.
  const grabar = async (alTranscribir) => {
    try {
      setFase(FASES.GRABANDO);
      const blob = await iniciar();
      setFase(FASES.PROCESANDO);
      const { texto } = await asistenteApi.transcribir(blob);
      if (!texto || !texto.trim()) {
        setMensaje("No detecté ninguna palabra en la grabación. Intenta de nuevo.");
        setFase(FASES.ERROR);
        return;
      }
      await alTranscribir(texto);
    } catch (err) {
      if (err.message !== "sin_permiso_microfono") {
        setMensaje("No se pudo procesar el audio. Intenta de nuevo.");
        setFase(FASES.ERROR);
      } else {
        // Vuelve a la pregunta de aclaración en vez de reiniciar todo, si
        // fue ahí donde se intentó grabar (aclaracionActual sigue en pie).
        setFase(aclaracionActual ? FASES.ACLARANDO : FASES.INICIO);
      }
    }
  };

  const responderAclaracion = async (valor) => {
    const nuevasAclaraciones = { ...aclaraciones, [aclaracionActual.campo]: valor };
    setAclaraciones(nuevasAclaraciones);
    await manejarInterpretar({
      texto: "",
      proyecto_id_contexto: proyectoIdContextoActivo || null,
      tool,
      parametros_llm: parametrosLlm,
      aclaraciones: nuevasAclaraciones,
      acciones_pendientes: accionesPendientes,
    });
  };

  const confirmar = async () => {
    setFase(FASES.EJECUTANDO);
    try {
      const resp = await asistenteApi.confirmar({ tool: propuesta.tool, parametros: propuesta.parametros });
      const idProyectoNuevo = propuesta.tool === "crear_proyecto" ? resp.resultado?.id : undefined;
      await avanzarOTerminar(resp.mensaje, accionesPendientes, idProyectoNuevo);
    } catch (err) {
      setMensaje(err.response?.data?.detail || "No se pudo completar la acción.");
      setFase(FASES.ERROR);
    }
  };

  const cancelar = async () => {
    if (propuesta) {
      asistenteApi.cancelar({ tool: propuesta.tool, parametros: propuesta.parametros }).catch(() => {});
    }
    reiniciar();
  };

  return (
    <Modal titulo="Asistente de voz" onCerrar={onCerrar}>
      <div className="stack">
        {fase === FASES.INICIO && (
          <div className="stack">
            <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>
              Dicta lo que quieres hacer, por ejemplo: "crea un entregable para David, el informe de
              ventas, para el viernes", "agrega a Diana a la reunión con David" o "¿cómo va el
              avance del proyecto Cubo?".
            </p>
            {errorMic && <p className="error-text">{errorMic}</p>}
            <button className="btn btn--primary" type="button" onClick={() => grabar(enviarTexto)}>
              🎙️ Grabar
            </button>
            <div className="stack" style={{ gap: 4 }}>
              <span style={{ fontSize: "0.85rem" }}>O escribe la instrucción:</span>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  className="input"
                  value={textoManual}
                  onChange={(e) => setTextoManual(e.target.value)}
                  placeholder="Escribe aquí..."
                  onKeyDown={(e) => e.key === "Enter" && enviarTexto(textoManual)}
                />
                <button className="btn btn--ghost" type="button" onClick={() => enviarTexto(textoManual)}>
                  Enviar
                </button>
              </div>
            </div>
          </div>
        )}

        {fase === FASES.GRABANDO && (
          <div className="stack">
            <p>🔴 Grabando... di tu instrucción.</p>
            <button className="btn btn--primary" type="button" onClick={detener}>
              Detener
            </button>
          </div>
        )}

        {fase === FASES.PROCESANDO && <p>Procesando...</p>}

        {fase === FASES.ACLARANDO && aclaracionActual && (
          <div className="stack">
            <p>{aclaracionActual.pregunta}</p>
            {aclaracionActual.tipo_entrada === "opciones" ? (
              <div className="stack" style={{ gap: 4 }}>
                {aclaracionActual.opciones.map((op) => (
                  <button
                    key={op.valor}
                    className="btn btn--ghost"
                    type="button"
                    onClick={() => responderAclaracion(op.valor)}
                  >
                    {op.etiqueta}
                  </button>
                ))}
              </div>
            ) : (
              <div className="stack" style={{ gap: 8 }}>
                {errorMic && <p className="error-text">{errorMic}</p>}
                <button
                  className="btn btn--primary"
                  type="button"
                  onClick={() => grabar(responderAclaracion)}
                >
                  🎙️ Responder por voz
                </button>
                <div className="stack" style={{ gap: 4 }}>
                  <span style={{ fontSize: "0.85rem" }}>O escribe tu respuesta:</span>
                  <RespuestaTexto onEnviar={responderAclaracion} />
                </div>
              </div>
            )}
          </div>
        )}

        {fase === FASES.CONFIRMANDO && propuesta && (
          <div className="stack">
            <VistaPreviaAccion preview={propuesta.preview} />
            <p>{propuesta.resumen}</p>
            {accionesPendientes.length > 0 && (
              <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
                + {accionesPendientes.length} acción{accionesPendientes.length === 1 ? "" : "es"} más después de esta
              </p>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn--primary" type="button" onClick={confirmar}>
                Confirmar
              </button>
              <button className="btn btn--ghost" type="button" onClick={cancelar}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {fase === FASES.EJECUTANDO && <p>Ejecutando...</p>}

        {fase === FASES.RESULTADO && (
          <div className="stack">
            {mensajesAcumulados.length > 1 ? (
              <ul style={{ margin: 0, paddingLeft: "1.2rem" }}>
                {mensajesAcumulados.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            ) : (
              <p>{tipoResultado === "respuesta" ? "💬" : "✅"} {respuestaTexto}</p>
            )}
            <button className="btn btn--ghost" type="button" onClick={reiniciar}>
              Hacer otra cosa
            </button>
          </div>
        )}

        {fase === FASES.ERROR && (
          <div className="stack">
            <p className="error-text">{mensaje}</p>
            <button
              className="btn btn--ghost"
              type="button"
              onClick={() => (aclaracionActual ? setFase(FASES.ACLARANDO) : reiniciar())}
            >
              Reintentar
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function RespuestaTexto({ onEnviar }) {
  const [valor, setValor] = useState("");
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <input
        className="input"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        placeholder="Escribe tu respuesta..."
        onKeyDown={(e) => e.key === "Enter" && valor.trim() && onEnviar(valor)}
        autoFocus
      />
      <button className="btn btn--primary" type="button" onClick={() => valor.trim() && onEnviar(valor)}>
        Enviar
      </button>
    </div>
  );
}

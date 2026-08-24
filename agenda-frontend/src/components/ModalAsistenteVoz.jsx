import { useEffect, useRef, useState } from "react";
import { asistenteApi } from "../api/endpoints";
import useGrabadorAudio from "../hooks/useGrabadorAudio";
import useSintesisVoz from "../hooks/useSintesisVoz";
import { useModoVoz } from "../hooks/useModoVoz";
import { clasificarIntencionVoz } from "../utils/intencionVoz";
import { desbloquearAudio, reproducirBeep } from "../utils/sonidoBeep";
import VistaPreviaAccion from "./asistente/VistaPreviaAccion";
import TextoAsistente from "./asistente/TextoAsistente";
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

const LIMITE_REINTENTOS_CONFIRMACION = 2;

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

  // Voz de salida (texto-a-voz) + modo manos-libres: lee el mensaje de cada
  // fase y, si modoVoz está activo, escucha la respuesta automáticamente al
  // terminar de hablar. ultimoTextoLeidoRef evita releer el mismo mensaje en
  // cada re-render; reintentosRef limita cuántas veces se vuelve a preguntar
  // "¿confirmas o cancelas?" antes de dejar solo los botones como salida.
  const { soportado: vozSoportada, hablar, detener: detenerVoz, desbloquear: desbloquearVoz } = useSintesisVoz();
  const { modoVoz, alternarModoVoz } = useModoVoz();
  const modoVozRef = useRef(modoVoz);
  const ultimoTextoLeidoRef = useRef("");
  // Recuerda en qué fase se leyó el último mensaje: si el texto de un nuevo
  // error/resumen es IDÉNTICO al anterior (ej. "No entendí bien esa
  // instrucción." dos veces seguidas), la comparación por texto sola no
  // distingue "es el mismo render repitiéndose" de "es un segundo intento
  // real que dio el mismo mensaje" — por eso también se compara si de
  // verdad se volvió a ENTRAR a la fase (pasando por otra fase en medio,
  // como PROCESANDO), no solo si el texto cambió.
  const ultimaFaseHabladaRef = useRef(null);
  const reintentosRef = useRef(0);
  const audioDesbloqueadoRef = useRef(false);

  useEffect(() => {
    modoVozRef.current = modoVoz;
  }, [modoVoz]);

  // Chrome/Safari en móvil solo dejan "arrancar" audio (síntesis de voz o el
  // beep de Web Audio) dentro de un gesto de usuario síncrono — se llama una
  // sola vez, en el primer clic real dentro del modal, antes de que el modo
  // manos-libres intente reproducir nada por su cuenta de forma asíncrona.
  const desbloquearInteraccion = () => {
    if (audioDesbloqueadoRef.current) return;
    audioDesbloqueadoRef.current = true;
    desbloquearAudio();
    desbloquearVoz();
  };

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
    detenerVoz();
    ultimoTextoLeidoRef.current = "";
    ultimaFaseHabladaRef.current = null;
    reintentosRef.current = 0;
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
        await avanzarOTerminar(resp.mensaje, resp.acciones_pendientes || [], undefined, "respuesta");
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
  const avanzarOTerminar = async (mensajeAccion, colaRestante, idProyectoNuevo, tipoOrigen = "accion") => {
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
    setTipoResultado(tipoOrigen);
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
    if (fase === FASES.GRABANDO || fase === FASES.PROCESANDO) return;
    // Se guarda para poder volver exactamente a esta fase (con su propuesta/
    // aclaración/error intactos) si falla el permiso de micrófono — antes
    // solo contemplaba ACLARANDO/INICIO; con el modo manos-libres, grabar()
    // también se dispara automáticamente desde CONFIRMANDO y ERROR.
    const faseOrigen = fase;
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
        setFase(faseOrigen);
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

  // Suena un beep breve (señal de "ya puedes hablar") y arranca a grabar,
  // sin que el usuario toque nada — usado por el modo manos-libres.
  const escucharConVoz = async (alTranscribir) => {
    await reproducirBeep();
    grabar(alTranscribir);
  };

  const manejarTranscripcionConfirmacion = (texto) => {
    const intencion = clasificarIntencionVoz(texto);
    if (intencion === "confirmar") return confirmar();
    if (intencion === "cancelar") return cancelar();
    reintentosRef.current += 1;
    if (reintentosRef.current > LIMITE_REINTENTOS_CONFIRMACION) {
      hablar("Puedes usar los botones para confirmar o cancelar.");
      return;
    }
    const textoReintento =
      intencion === "repetir" ? propuesta.resumen : "No entendí si confirmas o cancelas. Dilo de nuevo o usa los botones.";
    hablar(textoReintento, { onFin: () => escucharConVoz(manejarTranscripcionConfirmacion) });
  };

  const manejarRespuestaError = (texto) => {
    const intencion = clasificarIntencionVoz(texto);
    if (intencion === "cancelar") return reiniciar();
    if (aclaracionActual) return responderAclaracion(texto);
    if (intencion === "repetir") {
      hablar("Dime de nuevo tu instrucción.", { onFin: () => escucharConVoz(enviarTexto) });
      return;
    }
    return enviarTexto(texto);
  };

  // Corta cualquier lectura en curso al entrar a una fase sin mensaje que
  // leer (grabando/procesando/ejecutando) — cubre tanto el caso de que el
  // usuario grabe manualmente mientras el asistente habla, como el de que
  // una acción se ejecute justo después de leer el resumen.
  useEffect(() => {
    if ([FASES.GRABANDO, FASES.PROCESANDO, FASES.EJECUTANDO].includes(fase)) {
      detenerVoz();
    }
  }, [fase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lee en voz alta el mensaje de la fase actual (pregunta de aclaración,
  // resumen a confirmar, error, o resultado) y, si el modo manos-libres está
  // activo, escucha automáticamente la respuesta al terminar de hablar.
  useEffect(() => {
    let texto = "";
    if (fase === FASES.ACLARANDO && aclaracionActual) {
      texto = aclaracionActual.pregunta;
      if (aclaracionActual.tipo_entrada === "opciones" && aclaracionActual.opciones?.length) {
        texto += " Opciones: " + aclaracionActual.opciones.map((op) => op.etiqueta).join(", ");
      }
    } else if (fase === FASES.CONFIRMANDO && propuesta) {
      texto = propuesta.resumen;
    } else if (fase === FASES.ERROR) {
      texto = mensaje;
    } else if (fase === FASES.RESULTADO) {
      texto = mensajesAcumulados.length > 1 ? mensajesAcumulados.join(". ") : respuestaTexto;
    }

    // Si de verdad se acaba de ENTRAR a esta fase (pasando por otra fase en
    // medio, ej. PROCESANDO), es un evento nuevo y se habla aunque el texto
    // coincida con el de la vez anterior. Si la fase no cambió, solo se
    // dedupea por texto (protege contra re-renders/StrictMode repitiendo
    // el mismo mensaje sin ningún evento nuevo real).
    const esEntradaNueva = fase !== ultimaFaseHabladaRef.current;
    ultimaFaseHabladaRef.current = fase;

    if (!texto) return;
    if (!esEntradaNueva && texto === ultimoTextoLeidoRef.current) return;
    ultimoTextoLeidoRef.current = texto;
    reintentosRef.current = 0;

    const faseAlHablar = fase;
    const aclaracionAlHablar = aclaracionActual;
    hablar(texto, {
      onFin: () => {
        if (!modoVozRef.current) return;
        if (faseAlHablar === FASES.CONFIRMANDO) {
          escucharConVoz(manejarTranscripcionConfirmacion);
        } else if (faseAlHablar === FASES.ERROR) {
          escucharConVoz(manejarRespuestaError);
        } else if (faseAlHablar === FASES.ACLARANDO && aclaracionAlHablar?.tipo_entrada !== "opciones") {
          escucharConVoz(responderAclaracion);
        }
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase, aclaracionActual, propuesta, mensaje, respuestaTexto, mensajesAcumulados]);

  return (
    <Modal titulo="Asistente de voz" onCerrar={onCerrar} ocultarAsistenteVoz>
      <div className="stack">
        {vozSoportada && (
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              className="btn btn--ghost"
              type="button"
              style={{ fontSize: "0.8rem" }}
              onClick={() => {
                desbloquearInteraccion();
                if (modoVoz) detenerVoz();
                alternarModoVoz();
              }}
            >
              {modoVoz ? "🔊 Voz activada" : "🔇 Voz desactivada"}
            </button>
          </div>
        )}
        {fase === FASES.INICIO && (
          <div className="stack">
            <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>
              Dicta lo que quieres hacer, por ejemplo: "crea un entregable para David, el informe de
              ventas, para el viernes", "agrega a Diana a la reunión con David" o "¿cómo va el
              avance del proyecto Cubo?".
            </p>
            {errorMic && <p className="error-text">{errorMic}</p>}
            <button
              className="btn btn--primary"
              type="button"
              onClick={() => {
                desbloquearInteraccion();
                grabar(enviarTexto);
              }}
            >
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
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      desbloquearInteraccion();
                      enviarTexto(textoManual);
                    }
                  }}
                />
                <button
                  className="btn btn--ghost"
                  type="button"
                  onClick={() => {
                    desbloquearInteraccion();
                    enviarTexto(textoManual);
                  }}
                >
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
            <TextoAsistente texto={propuesta.resumen} />
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
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <span>{tipoResultado === "respuesta" ? "💬" : "✅"}</span>
                <TextoAsistente texto={respuestaTexto} />
              </div>
            )}
            <button className="btn btn--ghost" type="button" onClick={reiniciar}>
              Hacer otra cosa
            </button>
          </div>
        )}

        {fase === FASES.ERROR && (
          <div className="stack">
            <TextoAsistente texto={mensaje} className="error-text" />
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

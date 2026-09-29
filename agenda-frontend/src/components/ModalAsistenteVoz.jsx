import { useEffect, useRef, useState } from "react";
import { asistenteApi } from "../api/endpoints";
import useGrabadorAudio from "../hooks/useGrabadorAudio";
import useSintesisVozNeural from "../hooks/useSintesisVozNeural";
import { usePreferenciasApariencia } from "../hooks/usePreferenciasApariencia";
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

export default function ModalAsistenteVoz({ proyectoIdContexto, onCerrar, activadoPorPalabraClave = false }) {
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
  // Memoria de conversación de CORTO PLAZO (2026-09-25, Fase 2 del plan de
  // fluidez de Chambeador) -- turnos ya cerrados de esta MISMA sesión del
  // modal, para que el backend pueda resolver referencias a lo ya dicho
  // ("mejor para el viernes" sin repetir de qué tarea se trataba). Vive
  // solo en memoria del navegador, NUNCA se persiste ni sobrevive a cerrar
  // el modal -- a propósito NO se limpia en reiniciar() (esa función
  // prepara la fase para la SIGUIENTE instrucción dentro de la misma
  // conversación, justo donde la memoria debe seguir viva). Acotado a los
  // últimos 6 turnos para no inflar cada llamada al LLM sin límite.
  const historialRef = useRef([]);
  const LIMITE_HISTORIAL = 6;
  // Texto original con el que arrancó la instrucción en curso -- se guarda
  // aquí (no basta con el parámetro de enviarTexto, porque aclaraciones y
  // acciones compuestas pasan por manejarInterpretar sin volver a pasar por
  // enviarTexto) para poder armar el turno completo cuando se llega a
  // FASES.RESULTADO.
  const textoOrigenRef = useRef("");
  // "Confirmar todo" (2026-09-25, Fase 3 fluidez) -- true mientras se está
  // auto-confirmando el resto de una instrucción compuesta sin volver a
  // preguntar acción por acción (ver confirmarTodo/ejecutarPropuesta). Ref,
  // no estado: se lee inmediatamente después de setearlo en el mismo
  // "tick" (confirmarTodo llama a ejecutarPropuesta justo después), y un
  // useState ahí se quedaría con el valor viejo por el batching de React.
  const confirmarTodoRef = useRef(false);

  // Voz de salida (texto-a-voz) + modo manos-libres: lee el mensaje de cada
  // fase y, si modoVoz está activo, escucha la respuesta automáticamente al
  // terminar de hablar. ultimoTextoLeidoRef evita releer el mismo mensaje en
  // cada re-render; reintentosRef limita cuántas veces se vuelve a preguntar
  // "¿confirmas o cancelas?" antes de dejar solo los botones como salida.
  const { vozAsistente } = usePreferenciasApariencia();
  const { soportado: vozSoportada, hablar, detener: detenerVoz, desbloquear: desbloquearVoz } = useSintesisVozNeural(vozAsistente);
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
    confirmarTodoRef.current = false;
  };

  const manejarInterpretar = async (payload) => {
    setFase(FASES.PROCESANDO);
    try {
      const resp = await asistenteApi.interpretar(payload);
      setAccionesPendientes(resp.acciones_pendientes || []);
      if (resp.tipo === "propuesta") {
        setTool(resp.tool);
        setPropuesta({ tool: resp.tool, parametros: resp.parametros, resumen: resp.resumen, preview: resp.preview });
        // "Confirmar todo" en curso (2026-09-25) -- esta acción también se
        // auto-confirma, sin detenerse a mostrar CONFIRMANDO.
        if (confirmarTodoRef.current) {
          await ejecutarPropuesta(resp.tool, resp.parametros, resp.acciones_pendientes || []);
        } else {
          setFase(FASES.CONFIRMANDO);
        }
      } else if (resp.tipo === "aclaracion") {
        // Una acción de la cadena necesita un dato que falta -- no se puede
        // seguir auto-confirmando a ciegas, se detiene a preguntar como
        // siempre (confirmarTodoRef sigue en true: si tras responder esto
        // la siguiente acción vuelve a ser una "propuesta" limpia, el
        // auto-confirmar se retoma solo).
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

    // La instrucción compuesta terminó -- que "confirmar todo" no se
    // arrastre a la SIGUIENTE instrucción, que debe volver a preguntar
    // normal por default.
    confirmarTodoRef.current = false;

    const mensajeFinal = mensajesRef.current.join(" ");
    setRespuestaTexto(mensajeFinal);
    setTipoResultado(tipoOrigen);
    setFase(FASES.RESULTADO);

    // Cierra el turno en la memoria de corto plazo -- solo si de verdad
    // hubo un texto de usuario que lo originó (una acción encadenada de una
    // instrucción compuesta ya quedó cubierta por el turno de la primera).
    if (textoOrigenRef.current) {
      historialRef.current = [
        ...historialRef.current,
        { usuario: textoOrigenRef.current, asistente: mensajeFinal },
      ].slice(-LIMITE_HISTORIAL);
      textoOrigenRef.current = "";
    }
  };

  const enviarTexto = async (texto) => {
    if (!texto.trim()) return;
    textoOrigenRef.current = texto;
    await manejarInterpretar({
      texto,
      proyecto_id_contexto: proyectoIdContextoActivo || null,
      historial: historialRef.current,
    });
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
      // Relleno de silencio (2026-09-04, a petición de Yue: la espera de
      // PROCESANDO se sentía más larga de lo que era, por quedar en
      // silencio total) -- repite lo que entendió mientras de verdad se
      // procesa la instrucción en el servidor. No lleva onFin -- si la
      // respuesta real llega antes de que termine de leer esto, el
      // siguiente hablar() (del efecto de mensajes) la interrumpe solo
      // (hablar() siempre cancela lo anterior, ver useSintesisVoz.js).
      if (vozSoportada) {
        hablar(`Escuché: ${texto}. Dame un momento.`);
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
    // Selección directa (clic en una opción, tipo_entrada "opciones") --
    // sin ambigüedad que interpretar, mismo camino directo de siempre. No
    // se manda campo_pendiente -- el backend no llama al LLM otra vez.
    if (aclaracionActual.tipo_entrada === "opciones") {
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
      return;
    }
    // Texto libre/voz (2026-09-29, rediseño conversacional) -- ya no se
    // mete `valor` a la fuerza como respuesta literal del campo pendiente:
    // se manda tal cual para que el backend decida si es una respuesta
    // directa, una corrección/cambio de tema, o un cancelar (ver
    // interprete.py::interpretar_seguimiento). Bug real que esto corrige:
    // "no, quiero un pendiente personal" se quedaba trabado porque se
    // intentaba meter como valor de un campo sin sentido.
    await manejarInterpretar({
      texto: valor,
      proyecto_id_contexto: proyectoIdContextoActivo || null,
      tool,
      parametros_llm: parametrosLlm,
      aclaraciones,
      acciones_pendientes: accionesPendientes,
      historial: historialRef.current,
      campo_pendiente: aclaracionActual.campo,
      pregunta_pendiente: aclaracionActual.pregunta,
      opciones_pendientes: aclaracionActual.opciones,
    });
  };

  // Ejecuta una propuesta ya resuelta (tool+parametros) y avanza a la
  // siguiente de la cola, si hay -- extraído de confirmar() (2026-09-25,
  // Fase 3 fluidez) para poder reusarlo también desde el auto-confirmar de
  // "confirmar todo" (manejarInterpretar), que actúa sobre la respuesta
  // recién llegada del servidor en vez del estado `propuesta` (evita
  // depender de un render de por medio).
  const ejecutarPropuesta = async (tool, parametros, colaRestante) => {
    setFase(FASES.EJECUTANDO);
    try {
      const resp = await asistenteApi.confirmar({ tool, parametros });
      const idProyectoNuevo = tool === "crear_proyecto" ? resp.resultado?.id : undefined;
      await avanzarOTerminar(resp.mensaje, colaRestante, idProyectoNuevo);
    } catch (err) {
      // Si algo falla a medias de una cadena "confirmar todo", no seguir
      // auto-confirmando el resto a ciegas -- se detiene en ERROR como
      // cualquier fallo normal.
      confirmarTodoRef.current = false;
      setMensaje(err.response?.data?.detail || "No se pudo completar la acción.");
      setFase(FASES.ERROR);
    }
  };

  const confirmar = () => ejecutarPropuesta(propuesta.tool, propuesta.parametros, accionesPendientes);

  // "Confirmar todo" (2026-09-25, Fase 3 fluidez) -- para una instrucción
  // compuesta ("crea el proyecto X y pon a Juan de líder"), evita tener que
  // confirmar cada acción por separado: confirma esta y activa el
  // auto-confirmar para las que sigan en la cola (ver manejarInterpretar).
  // Se detiene solo si una acción necesita una aclaración (falta un dato) o
  // si algo falla -- nunca ejecuta a ciegas algo que el sistema no pudo
  // resolver con lo ya dicho.
  const confirmarTodo = () => {
    confirmarTodoRef.current = true;
    return confirmar();
  };

  const cancelar = async () => {
    if (propuesta) {
      asistenteApi.cancelar({ tool: propuesta.tool, parametros: propuesta.parametros }).catch(() => {});
    }
    reiniciar();
  };

  // Corregir una propuesta YA armada sin cancelar y repetir todo desde cero
  // (2026-09-25, Fase 3 del plan de fluidez de Chambeador) -- ej. estás en
  // CONFIRMANDO con "voy a crear la tarea X para el jueves" y dices "no,
  // mejor el viernes": en vez de forzar cancelar()+enviarTexto() de nuevo,
  // se reinterpreta usando la propuesta actual como parte del historial
  // (memoria de corto plazo, Fase 2) para que el LLM entienda que es un
  // AJUSTE sobre lo mismo, no una instrucción nueva sin relación.
  const corregirPropuesta = async (texto) => {
    if (!texto.trim() || !propuesta) return;
    const historialConPropuestaActual = [
      ...historialRef.current,
      { usuario: textoOrigenRef.current, asistente: propuesta.resumen },
    ];
    textoOrigenRef.current = texto;
    if (propuesta) {
      asistenteApi.cancelar({ tool: propuesta.tool, parametros: propuesta.parametros }).catch(() => {});
    }
    await manejarInterpretar({
      texto,
      proyecto_id_contexto: proyectoIdContextoActivo || null,
      historial: historialConPropuestaActual,
    });
  };

  // Suena un beep breve (señal de "ya puedes hablar") y arranca a grabar,
  // sin que el usuario toque nada — usado por el modo manos-libres.
  const escucharConVoz = async (alTranscribir) => {
    await reproducirBeep();
    grabar(alTranscribir);
  };

  // Saluda por voz y arranca a escuchar solo en cuanto se abre el modal,
  // sin que el usuario tenga que tocar el botón de grabar (2026-09-24, a
  // petición de Yue) -- antes esto solo pasaba si el modal se abría por la
  // palabra clave "chambeador" (ver activadoPorPalabraClave); ahora que esa
  // vía está deshabilitada (ver FabAsistenteVoz.jsx), el único punto de
  // entrada es el botón flotante del micrófono, y el clic en ESE botón ya
  // es el gesto de usuario que el navegador exige para poder hablar/grabar
  // sin bloqueos. Se dispara UNA sola vez al montar (por eso el array de
  // dependencias vacío).
  useEffect(() => {
    desbloquearInteraccion();
    if (vozSoportada) {
      hablar("Hola, ¿en qué puedo ayudarte?", { onFin: () => escucharConVoz(enviarTexto) });
    } else {
      escucharConVoz(enviarTexto);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const manejarTranscripcionConfirmacion = (texto) => {
    const intencion = clasificarIntencionVoz(texto);
    if (intencion === "confirmar") {
      // "confirma todo"/"confirmar todo" (2026-09-25, Fase 3 fluidez) --
      // solo tiene efecto real si hay más acciones en cola; si no, se
      // comporta igual que un confirmar normal.
      if (accionesPendientes.length > 0 && /\btodo\b/i.test(texto)) return confirmarTodo();
      return confirmar();
    }
    if (intencion === "cancelar") return cancelar();
    if (intencion === "repetir") {
      hablar(propuesta.resumen, { onFin: () => escucharConVoz(manejarTranscripcionConfirmacion) });
      return;
    }
    // "corregir" o sin clasificar (2026-09-25, Fase 3 fluidez) -- cualquier
    // otra cosa que se diga aquí es, casi siempre, un intento de ajustar la
    // propuesta ("mejor a las 4", sin ningún "no" -- antes esto se perdía
    // en el ciclo de "no entendí si confirmas o cancelas" sin siquiera
    // intentar entenderlo). corregirPropuesta ya pasa por el LLM, que tiene
    // su propio "no_entendido" -- no hace falta un límite de reintentos
    // aparte aquí, cada intento hace progreso real en vez de repetir la
    // misma pregunta sin avanzar.
    reintentosRef.current = 0;
    return corregirPropuesta(texto);
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

  // "¿Necesitas algo más?" (2026-09-04, a petición de Yue) -- tras
  // terminar una acción/respuesta (fase RESULTADO), en vez de quedarse
  // callado esperando a que toquen "Hacer otra cosa", pregunta por voz y
  // sigue la conversación sin manos: "sí" reinicia y arranca a escuchar
  // una instrucción nueva (mismo `enviarTexto` de siempre); "no" cierra
  // el asistente, dando la conversación por terminada.
  const manejarRespuestaContinuar = (texto) => {
    const intencion = clasificarIntencionVoz(texto);
    if (intencion === "confirmar") {
      reiniciar();
      hablar("¿En qué más te ayudo?", { onFin: () => escucharConVoz(enviarTexto) });
      return;
    }
    if (intencion === "cancelar") {
      onCerrar();
      return;
    }
    reintentosRef.current += 1;
    if (reintentosRef.current > LIMITE_REINTENTOS_CONFIRMACION) {
      hablar('Puedes usar el botón "Hacer otra cosa" o cerrar el asistente.');
      return;
    }
    hablar("¿Necesitas algo más? Di sí o no.", { onFin: () => escucharConVoz(manejarRespuestaContinuar) });
  };

  // Corta cualquier lectura en curso al entrar a una fase sin mensaje que
  // leer (grabando/procesando/ejecutando) — cubre tanto el caso de que el
  // usuario grabe manualmente mientras el asistente habla, como el de que
  // una acción se ejecute justo después de leer el resumen.
  // PROCESANDO ya NO está en esta lista (2026-09-04, a petición de Yue --
  // ver el "relleno de silencio" en grabar() más abajo): antes se cortaba
  // cualquier voz al entrar a PROCESANDO, dejando la espera de la
  // respuesta del servidor en silencio total, lo que hacía sentir la
  // espera más larga de lo que en realidad es. GRABANDO sigue aquí
  // (nunca se debe hablar mientras el micrófono está escuchando, se
  // grabaría a sí mismo) y EJECUTANDO también (es rápido, no vale la pena
  // rellenar).
  useEffect(() => {
    if ([FASES.GRABANDO, FASES.EJECUTANDO].includes(fase)) {
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
      // "¿Necesitas algo más?" (2026-09-04) -- se agrega a la MISMA
      // lectura en vez de una segunda llamada a hablar() aparte, para no
      // pelear con el resto de la lógica de dedup/onFin de este efecto
      // (una sola fase = un solo hablar()).
      if (texto) texto += " ¿Necesitas algo más?";
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
        } else if (faseAlHablar === FASES.RESULTADO) {
          escucharConVoz(manejarRespuestaContinuar);
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
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn btn--primary" type="button" onClick={confirmar}>
                Confirmar
              </button>
              {accionesPendientes.length > 0 && (
                <button className="btn btn--primary" type="button" onClick={confirmarTodo}>
                  Confirmar todo ({accionesPendientes.length + 1})
                </button>
              )}
              <button className="btn btn--ghost" type="button" onClick={cancelar}>
                Cancelar
              </button>
            </div>
            {/* Corregir sin cancelar (2026-09-25, Fase 3 fluidez) -- ej.
                "mejor el viernes" ajusta la propuesta en vez de tener que
                cancelar y repetir toda la instrucción desde cero. */}
            <div className="stack" style={{ gap: 4 }}>
              <span style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
                ¿Algo que cambiar? Escríbelo en vez de cancelar:
              </span>
              <RespuestaTexto onEnviar={corregirPropuesta} placeholder="ej. mejor el viernes" />
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

function RespuestaTexto({ onEnviar, placeholder = "Escribe tu respuesta..." }) {
  const [valor, setValor] = useState("");
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <input
        className="input"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        placeholder={placeholder}
        onKeyDown={(e) => e.key === "Enter" && valor.trim() && onEnviar(valor)}
        autoFocus
      />
      <button className="btn btn--primary" type="button" onClick={() => valor.trim() && onEnviar(valor)}>
        Enviar
      </button>
    </div>
  );
}

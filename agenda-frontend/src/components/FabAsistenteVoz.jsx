import { useEffect, useState } from "react";
import ModalAsistenteVoz from "./ModalAsistenteVoz";
import { useDetectorPalabraClave } from "../hooks/useDetectorPalabraClave";
import { useFabAntizoom } from "../hooks/useFabAntizoom";
import useSintesisVoz from "../hooks/useSintesisVoz";
import { desbloquearAudio } from "../utils/sonidoBeep";

// Preferencia de "chambeador" persistida (2026-09-07, a petición de Yue:
// "también quiero probar con la opción 2 después" -- auto-activar al abrir
// la app, en vez de tener que tocar el botón cada vez). Se guarda por
// dispositivo en localStorage, mismo patrón que otras preferencias de la
// app (ver rendimiento_metricas_visibles). Default false -- sigue sin
// prenderse solo la PRIMERA vez que alguien usa la app; una vez que lo
// prende manualmente una vez, se queda recordado y se auto-activa en
// cada sesión siguiente sin más clics.
const CLAVE_CHAMBEADOR_ACTIVO = "chambeador_activo_preferencia";

function cargarPreferenciaChambeador() {
  try {
    return localStorage.getItem(CLAVE_CHAMBEADOR_ACTIVO) === "true";
  } catch {
    return false;
  }
}

function guardarPreferenciaChambeador(valor) {
  try {
    localStorage.setItem(CLAVE_CHAMBEADOR_ACTIVO, valor ? "true" : "false");
  } catch {
    // Privacidad estricta / cuota llena -- la preferencia solo dura la sesión.
  }
}

/**
 * Botón flotante de micrófono, disponible en toda la app (montado una sola
 * vez en AppLayout.jsx) — el asistente de voz ejecuta acciones sin tener
 * que navegar a ninguna pantalla en particular.
 *
 * `variante="dentro-modal"` (2026-08-23, a petición de Yue): además de la
 * instancia global de la pantalla base, Modal.jsx monta una copia por
 * modal abierto, posicionada dentro de la tarjeta (esquina inferior
 * izquierda) en vez de fija a toda la pantalla -- así el asistente queda
 * visible/usable sin tener que cerrar el modal para llegar al flotante
 * global de atrás.
 */
export default function FabAsistenteVoz({ proyectoIdContexto, variante = "global" }) {
  const [abierto, setAbierto] = useState(false);
  // Si el modal se abrió porque se detectó "chambeador" (en vez de tocar
  // el botón), ModalAsistenteVoz saluda por voz y arranca a escuchar solo
  // -- ver activadoPorPalabraClave ahí.
  const [abiertoPorPalabraClave, setAbiertoPorPalabraClave] = useState(false);
  // Solo la variante global usa position: fixed a toda la página (la de
  // "dentro-modal" es position: absolute anclada a su propia tarjeta, no
  // le afecta el mismo problema de zoom -- ver useFabAntizoom.js).
  // 24px = var(--space-4) en tokens.css, mismo margen que ya usaba
  // .fab-asistente-voz -- para no correr el botón de lugar en el caso
  // normal (sin zoom), solo corrige cuando el viewport visible diverge.
  const estiloAntizoom = useFabAntizoom(24);

  // "Chambeador" (2026-09-04, a petición de Yue) -- detector de palabra
  // clave, SOLO en la variante global (no tiene sentido tener dos
  // escuchando a la vez si hay un modal abierto con su propia copia del
  // FAB). Mientras el modal del asistente está abierto, el detector se
  // apaga solo (no puede haber dos reconocimientos de voz activos a la
  // vez) y se reactiva al cerrar, SI la preferencia guardada sigue
  // encendida (ver cerrarModal) -- antes reactivaba siempre sin importar
  // la preferencia, lo cual encendía "chambeador" solo por abrir y cerrar
  // el asistente con el botón del micrófono aunque nunca se hubiera
  // prendido a propósito.
  const { desbloquear: desbloquearVoz } = useSintesisVoz();
  const detector = useDetectorPalabraClave(() => {
    setAbiertoPorPalabraClave(true);
    setAbierto(true);
  });
  const mostrarDetector = variante === "global" && detector.soportado;

  // Auto-activar al abrir la app (2026-09-07) si la preferencia guardada
  // está encendida -- arrancar el reconocimiento de voz en sí no necesita
  // gesto de usuario en Chrome (solo pide permiso de micrófono la primera
  // vez), así que esto puede pasar directo al montar, sin esperar un clic.
  useEffect(() => {
    if (mostrarDetector && cargarPreferenciaChambeador()) detector.iniciar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mostrarDetector]);

  // La síntesis de voz (el saludo al detectar la palabra clave) y el beep
  // SÍ necesitan un gesto de usuario para desbloquearse en Chrome/Safari
  // móvil -- como ahora "chambeador" se puede activar SOLO (sin que el
  // usuario haya tocado el botón de activarlo), se aprovecha la primera
  // interacción que sea con la app entera (un tap o tecla en cualquier
  // parte, no necesariamente el botón de chambeador) para desbloquear
  // ambos, una sola vez.
  useEffect(() => {
    if (!mostrarDetector) return undefined;
    const desbloquearUnaVez = () => {
      desbloquearAudio();
      desbloquearVoz();
    };
    document.addEventListener("pointerdown", desbloquearUnaVez, { once: true });
    document.addEventListener("keydown", desbloquearUnaVez, { once: true });
    return () => {
      document.removeEventListener("pointerdown", desbloquearUnaVez);
      document.removeEventListener("keydown", desbloquearUnaVez);
    };
  }, [mostrarDetector, desbloquearVoz]);

  const alternarDetector = () => {
    if (detector.activo) {
      detector.detener();
      guardarPreferenciaChambeador(false);
      return;
    }
    // Desbloquea audio/voz DENTRO de este clic (gesto de usuario real) --
    // por si el usuario lo prende manualmente ANTES de haber interactuado
    // con nada más en la app (el desbloqueo de arriba todavía no disparó).
    desbloquearAudio();
    desbloquearVoz();
    detector.iniciar();
    guardarPreferenciaChambeador(true);
  };

  const cerrarModal = () => {
    setAbierto(false);
    setAbiertoPorPalabraClave(false);
    if (mostrarDetector && !detector.activo && cargarPreferenciaChambeador()) detector.iniciar();
  };

  return (
    <>
      {mostrarDetector && (
        <button
          className="btn btn--ghost fab-chambeador"
          type="button"
          onClick={alternarDetector}
          aria-label={detector.activo ? "Desactivar 'chambeador'" : "Activar 'chambeador'"}
          title={detector.activo ? "Desactivar 'chambeador'" : "Activar 'chambeador'"}
          style={
            estiloAntizoom
              ? { right: estiloAntizoom.right, bottom: `calc(${estiloAntizoom.bottom} + 56px)` }
              : undefined
          }
        >
          {detector.activo ? "👂 Chambeador activo" : "👂 Activar \"chambeador\""}
        </button>
      )}
      <button
        className={
          variante === "dentro-modal"
            ? "btn btn--primary fab-asistente-voz fab-asistente-voz--en-modal"
            : "btn btn--primary fab-asistente-voz"
        }
        style={variante === "global" ? estiloAntizoom || undefined : undefined}
        type="button"
        onClick={() => {
          if (mostrarDetector && detector.activo) detector.detener();
          setAbiertoPorPalabraClave(false);
          setAbierto(true);
        }}
        aria-label="Abrir asistente de voz"
        title="Asistente de voz"
      >
        🎙️
      </button>
      {abierto && (
        <ModalAsistenteVoz
          proyectoIdContexto={proyectoIdContexto}
          onCerrar={cerrarModal}
          activadoPorPalabraClave={abiertoPorPalabraClave}
        />
      )}
    </>
  );
}

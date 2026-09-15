import { useEffect, useState } from "react";

const CLAVE_DESCARTADO = "aviso_instalar_ios_descartado";

// iOS/iPadOS nunca dispara "beforeinstallprompt" (eso es exclusivo de
// Chrome/Android) -- instalar una PWA ahí SIEMPRE es manual, y encima solo
// funciona desde Safari: el resto de navegadores en iOS (Chrome, Firefox,
// Edge) son en realidad Safari por debajo (Apple lo exige así) pero sin
// acceso a "Agregar a inicio", que Apple reserva solo para su propia app.
// Sin este aviso, alguien en Chrome de iPhone nunca encuentra esa opción y
// piensa que la app no se puede instalar (2026-09-15, a petición de Yue,
// visto en el piloto).
function detectarEntornoIos() {
  const ua = navigator.userAgent || "";
  const esIos =
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ en modo "escritorio" se anuncia como Mac, se distingue
    // por tener pantalla táctil (una Mac de verdad no la tiene).
    (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  if (!esIos) return null;

  const yaInstalada =
    window.navigator.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches;
  if (yaInstalada) return null;

  const esSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return esSafari ? "safari" : "otro";
}

export default function AvisoInstalarIos() {
  const [entorno, setEntorno] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(CLAVE_DESCARTADO) === "1") return;
    const detectado = detectarEntornoIos();
    if (detectado) {
      setEntorno(detectado);
      setVisible(true);
    }
  }, []);

  const descartar = () => {
    setVisible(false);
    try {
      localStorage.setItem(CLAVE_DESCARTADO, "1");
    } catch {
      // Si localStorage no está disponible (modo privado, etc.), no pasa
      // nada grave -- el aviso solo volverá a salir la próxima vez.
    }
  };

  if (!visible) return null;

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        left: 12,
        right: 12,
        bottom: 12,
        zIndex: 1000,
        maxWidth: 420,
        margin: "0 auto",
        background: "var(--color-superficie, #0f2438)",
        color: "var(--color-texto-sobre-superficie, #fff)",
        borderRadius: 12,
        padding: "14px 16px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
        fontSize: "0.85rem",
        lineHeight: 1.4,
      }}
    >
      <button
        type="button"
        onClick={descartar}
        aria-label="Cerrar aviso"
        style={{
          position: "absolute",
          top: 6,
          right: 8,
          background: "none",
          border: "none",
          color: "inherit",
          fontSize: "1.1rem",
          cursor: "pointer",
          opacity: 0.7,
        }}
      >
        ×
      </button>
      {entorno === "otro" ? (
        <p style={{ margin: 0, paddingRight: 20 }}>
          Para instalar esta app en tu iPhone/iPad, ábrela primero en <strong>Safari</strong>{" "}
          (no funciona desde Chrome ni otros navegadores en iOS) y luego toca{" "}
          <strong>compartir → "Agregar a inicio"</strong>.
        </p>
      ) : (
        <p style={{ margin: 0, paddingRight: 20 }}>
          ¿Quieres instalar esta app en tu iPhone/iPad? Toca el ícono de{" "}
          <strong>compartir</strong> (el cuadrito con la flecha) abajo en Safari y luego{" "}
          <strong>"Agregar a inicio"</strong>.
        </p>
      )}
    </div>
  );
}

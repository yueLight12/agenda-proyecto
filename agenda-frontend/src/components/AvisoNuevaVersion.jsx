import { useRegisterSW } from "virtual:pwa-register/react";

// Aviso de "hay una versión nueva" (2026-09-17, a petición de Yue: "por qué
// a veces tengo que hacer hard refresh para ver los cambios") -- la app es
// una PWA con service worker (ver vite.config.js), así que el navegador
// guarda una copia local del bundle para que cargue rápido/offline. Con
// registerType: "autoUpdate" el SW nuevo se descarga e instala solo en
// segundo plano, pero una pestaña ya abierta se queda usando en memoria el
// bundle viejo hasta que se recarga -- de ahí el hard refresh manual.
// `useRegisterSW` (del propio vite-plugin-pwa) expone `needRefresh` cuando
// ya hay un SW nuevo esperando: este componente solo muestra un botón para
// recargar en ese momento, en vez de dejar que el usuario lo descubra solo.
export default function AvisoNuevaVersion() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegisterError(error) {
      console.error("No se pudo registrar el service worker:", error);
    },
  });

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        left: 12,
        right: 12,
        top: 12,
        zIndex: 1100,
        maxWidth: 420,
        margin: "0 auto",
        background: "var(--color-superficie, #0f2438)",
        color: "var(--color-texto-sobre-superficie, #fff)",
        borderRadius: 12,
        padding: "12px 16px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
        fontSize: "0.85rem",
        lineHeight: 1.4,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <span>Hay una versión nueva de la app disponible.</span>
      <button
        type="button"
        className="btn btn--primary"
        style={{ flexShrink: 0 }}
        onClick={() => updateServiceWorker(true)}
      >
        Actualizar
      </button>
    </div>
  );
}

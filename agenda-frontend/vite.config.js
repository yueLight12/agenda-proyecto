import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // El registro del service worker se hace a mano en
      // AvisoNuevaVersion.jsx (2026-09-17, a petición de Yue: "por qué a
      // veces hay que hacer hard refresh") -- con injectRegister: 'auto'
      // (default) el propio plugin inyecta un script que se registra sin
      // avisar a la UI cuando hay una versión nueva esperando, así que a
      // veces la pestaña se queda en el bundle viejo hasta un hard
      // refresh. injectRegister: false apaga ESE auto-registro para no
      // duplicar el registro del SW.
      injectRegister: false,
      // injectManifest (en vez del generateSW por default) porque
      // necesitamos código propio en el service worker para reaccionar a
      // eventos "push"/"notificationclick" (2026-08-23, notificaciones
      // urgentes fuera de la app) -- generateSW no permite agregar
      // manejadores de eventos custom, solo configurar cacheo.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.js",
      includeAssets: ["favicon.png", "apple-touch-icon.png"],
      manifest: {
        name: "Agenda Inteligente de Proyectos",
        short_name: "Agenda Inteligente",
        description: "Seguimiento de entregables, avances y roles por proyecto.",
        theme_color: "#0f2438",
        background_color: "#f7f8fa",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      // La API vive en otro origen (otro puerto/túnel), así que las
      // llamadas a datos nunca pasan por el navigateFallback del service
      // worker — este solo cachea el shell de la app (JS/CSS/HTML) para
      // que abra rápido e instale como app; los datos siempre son en vivo.
    }),
  ],
  server: {
    port: 5173,
    host: true,
    allowedHosts: true,
    watch: {
      usePolling: true,
    },
  },
  preview: {
    port: 5173,
    host: true,
    allowedHosts: true,
  },
});

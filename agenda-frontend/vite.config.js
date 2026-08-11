import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
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

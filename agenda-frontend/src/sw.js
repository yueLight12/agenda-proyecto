// Service worker de la PWA (2026-08-23): además de lo que ya generaba
// vite-plugin-pwa (precache del shell de la app, ver injectManifest en
// vite.config.js), reacciona a notificaciones push del backend
// (app/services/push.py) para poder avisar de un entregable urgente aunque
// la app esté cerrada y el celular con la pantalla apagada.
import { precacheAndRoute } from "workbox-precaching";

precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener("push", (event) => {
  let datos = { titulo: "Agenda Inteligente", cuerpo: "Tienes una notificación nueva.", url: "/" };
  if (event.data) {
    try {
      datos = { ...datos, ...event.data.json() };
    } catch {
      datos.cuerpo = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(datos.titulo, {
      body: datos.cuerpo,
      icon: "/pwa-192x192.png",
      badge: "/pwa-192x192.png",
      data: { url: datos.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((listaClientes) => {
      for (const cliente of listaClientes) {
        if (cliente.url.includes(url) && "focus" in cliente) {
          return cliente.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});

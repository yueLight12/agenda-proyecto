// Service worker de la PWA (2026-08-23): además de lo que ya generaba
// vite-plugin-pwa (precache del shell de la app, ver injectManifest en
// vite.config.js), reacciona a notificaciones push del backend
// (app/services/push.py) para poder avisar de un entregable urgente aunque
// la app esté cerrada y el celular con la pantalla apagada.
import { clientsClaim } from "workbox-core";
import { precacheAndRoute } from "workbox-precaching";

// Sin esto (2026-09-15, bug real encontrado en vivo: una corrección al
// tour de onboarding no se veía en el navegador aunque el build nuevo ya
// la tenía) un service worker nuevo se queda "esperando" en segundo plano
// hasta que se cierren TODAS las pestañas de la app -- el ciclo de vida
// default de los service workers, pensado para no interrumpir una sesión
// activa, pero que aquí solo generaba confusión ("¿de verdad ya subiste el
// cambio?"). skipWaiting + clientsClaim fuerza al nuevo service worker a
// tomar control de inmediato en la siguiente carga de página, sin esperar
// a que cierren pestañas.
self.skipWaiting();
clientsClaim();

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

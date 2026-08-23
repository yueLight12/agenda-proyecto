// Cliente de activación de notificaciones push del navegador (2026-08-23).
// Ver app/services/push.py (backend) y src/sw.js (manejo del evento
// "push" en el service worker).
import { pushApi } from "../api/endpoints";

// El navegador exige la llave VAPID como Uint8Array, no como el string
// base64url que entrega el backend -- conversión estándar de la spec Web
// Push (no hay forma de que pushManager.subscribe la acepte tal cual).
function base64UrlAUint8Array(base64Url) {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const binario = atob(base64);
  return Uint8Array.from([...binario].map((c) => c.charCodeAt(0)));
}

export function pushSoportado() {
  return "serviceWorker" in navigator && "PushManager" in window;
}

export async function activarNotificacionesPush() {
  if (!pushSoportado()) {
    return { ok: false, motivo: "Este navegador no soporta notificaciones push." };
  }

  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") {
    return { ok: false, motivo: "No se concedió permiso de notificaciones." };
  }

  const { vapid_public_key: vapidPublicKey } = await pushApi.vapidPublicKey();
  if (!vapidPublicKey) {
    return { ok: false, motivo: "El servidor todavía no tiene configuradas las notificaciones push." };
  }

  const registro = await navigator.serviceWorker.ready;
  let suscripcion = await registro.pushManager.getSubscription();
  if (!suscripcion) {
    suscripcion = await registro.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlAUint8Array(vapidPublicKey),
    });
  }

  const datos = suscripcion.toJSON();
  await pushApi.suscribir({
    endpoint: datos.endpoint,
    p256dh: datos.keys.p256dh,
    auth: datos.keys.auth,
  });

  return { ok: true };
}

export async function estadoNotificacionesPush() {
  if (!pushSoportado()) return "no-soportado";
  if (Notification.permission === "denied") return "denegado";
  const registro = await navigator.serviceWorker.ready;
  const suscripcion = await registro.pushManager.getSubscription();
  return suscripcion ? "activo" : "inactivo";
}

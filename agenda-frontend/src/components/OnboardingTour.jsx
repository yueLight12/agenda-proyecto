import { useEffect, useState } from "react";
import Joyride, { STATUS } from "react-joyride";
import { preferenciasApi } from "../api/endpoints";
import { useAuth } from "../context/AuthContext";

// FTUE/onboarding (2026-09-15, a petición de Yue, pensando en las 20-30
// personas que van a entrar por primera vez en el piloto): un recorrido
// que señala los botones/secciones REALES de la pantalla principal (estilo
// Clash Royale) en vez de un carrusel genérico de texto -- usa
// react-joyride (oscurece el resto de la pantalla, dibuja un spotlight
// sobre el elemento real vía selector CSS, y una burbuja con flecha). Los
// `target` de abajo son los `id` agregados a propósito en AgendaPlanB.jsx
// -- si algún día se renombra/quita uno de esos elementos, hay que
// actualizar el target aquí también, si no el paso correspondiente
// simplemente no aparece (Joyride se salta un paso cuyo target no existe,
// no truena).
//
// Se muestra en AgendaPlanB (no montado globalmente como el resto de
// avisos) porque necesita que esos elementos YA estén en el DOM -- entrar
// aquí es exactamente lo que pasa justo después de loguearse.
//
// Estado (PreferenciaUsuario.tour_completado, backend) en vez de
// localStorage -- no se repite si la persona entra desde otro dispositivo.
function pasosPara(usuario) {
  const esLider = (usuario?.roles_por_proyecto || []).some(
    (r) => r.rol === "N1" || r.rol === "N2"
  );

  const pasos = [
    {
      target: "body",
      placement: "center",
      title: "Bienvenido a Mi Chamba 👋",
      content:
        "Aquí ves tus tareas, tus reuniones y el avance de tu equipo en un solo lugar. Te mostramos rápido dónde está cada cosa.",
    },
    {
      target: "#tour-semana",
      title: "Tu semana",
      content: "Aquí ves lo que tienes agendado esta semana -- tareas y reuniones juntas.",
    },
    {
      target: "#tour-asignar",
      title: "Quiero asignar",
      content: "Desde aquí le asignas una tarea, reunión o pendiente a alguien de tu equipo.",
    },
    {
      target: "#tour-pendientes",
      title: "Lo urgente primero",
      content:
        'Esto se actualiza solo: lo que está vencido o a punto de vencer aparece aquí antes que nada.',
    },
    {
      target: "#tour-notificaciones",
      title: "Notificaciones",
      content:
        "Actívalas aquí para recibir avisos aunque tengas la app cerrada. Si diste tu WhatsApp, también te avisamos ahí.",
    },
  ];

  if (esLider) {
    pasos.push({
      target: "#tour-mi-equipo",
      title: "Tu equipo",
      content: "Da de alta gente nueva y arma tu equipo directo desde aquí, sin pedirle nada a un administrador.",
    });
  }

  pasos.push({
    target: "#tour-perfil",
    title: "Tu perfil",
    content:
      'Si entraste con una contraseña que te dieron (ej. "Demo1234!"), cámbiala aquí en cuanto puedas -- es solo tuya.',
  });

  return pasos;
}

export default function OnboardingTour() {
  const { usuario } = useAuth();
  const [preferencias, setPreferencias] = useState(null);

  useEffect(() => {
    if (!usuario) return;
    preferenciasApi
      .obtener()
      .then(setPreferencias)
      .catch(() => {});
  }, [usuario]);

  if (!usuario || !preferencias || preferencias.tour_completado) return null;

  const terminar = () => {
    setPreferencias((p) => ({ ...p, tour_completado: true }));
    preferenciasApi.actualizar({ tour_completado: true }).catch(() => {});
  };

  const manejarCallback = (datos) => {
    if (datos.status === STATUS.FINISHED || datos.status === STATUS.SKIPPED) {
      terminar();
    }
  };

  return (
    <Joyride
      steps={pasosPara(usuario)}
      run
      continuous
      showSkipButton
      showProgress
      scrollToFirstStep
      disableScrolling={false}
      callback={manejarCallback}
      locale={{
        back: "Atrás",
        close: "Cerrar",
        last: "Entendido",
        next: "Siguiente",
        skip: "Omitir",
      }}
      styles={{
        options: {
          primaryColor: "#0f2438",
          zIndex: 2000,
        },
      }}
    />
  );
}

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
        "Aquí ves tus tareas, tus reuniones y el avance de tu equipo en un solo lugar. Te mostramos rápido dónde está cada cosa -- son unos 10 pasos, puedes omitirlo cuando quieras.",
    },
    {
      target: "#tour-semana",
      title: "Tu semana",
      content: "Aquí ves lo que tienes agendado esta semana -- tareas y reuniones juntas.",
    },
    {
      target: "#tour-tarjeta-tarea",
      title: "Asignar una tarea",
      content: "Crea una tarea y asígnala a alguien de tu equipo, con fecha límite y prioridad.",
    },
    {
      target: "#tour-tarjeta-proyecto",
      title: "Crear un proyecto",
      content: "Crea un proyecto o tema nuevo, para ti o para organizar el trabajo de tu equipo.",
    },
    {
      target: "#tour-tarjeta-persona",
      title: "Elegir a alguien",
      content: "Elige primero a la persona y luego decide qué asignarle -- útil si ya sabes a quién, pero no qué.",
    },
    {
      target: "#tour-tarjeta-agenda",
      title: "Calendario y reuniones",
      content:
        "Aquí ves tu calendario completo y agendas una reunión nueva -- elige el día, la hora, y a quién invitar.",
    },
    {
      target: "#tour-tarjeta-rendimiento",
      title: "Rendimiento del equipo",
      content: "Aquí ves quién de tu equipo entrega más y a tiempo.",
    },
    {
      target: "#tour-pendientes",
      title: "Lo urgente primero",
      content:
        'Esto se actualiza solo: lo que está vencido o a punto de vencer aparece aquí antes que nada.',
    },
    {
      target: "body",
      placement: "center",
      title: "Notas",
      content:
        'Dentro de cualquier tarea, reunión o proyecto puedes dejar una nota -- se guarda ahí mismo y le llega un aviso a quien corresponda.',
    },
    {
      target: "#tour-notificaciones",
      title: "Notificaciones",
      content:
        "Actívalas aquí para recibir avisos aunque tengas la app cerrada. Si diste tu WhatsApp, también te avisamos ahí.",
    },
    {
      target: "#tour-mensajes",
      title: "Mensajes",
      content:
        "Escríbele directo a alguien de tu equipo o de tu misma área -- para algo que no es una tarea ni tiene que ver con un proyecto en concreto.",
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
      // El clic en el elemento resaltado NO debe disparar la acción real de
      // la app (2026-09-15, bug real: al tocar la tarjeta "Persona" durante
      // el tour se abría de verdad el modal de asignar tarea, y se quedaba
      // atorado detrás de los pasos siguientes) -- explícito aunque sea el
      // default, para no depender de que no cambie en una futura versión.
      spotlightClicks={false}
      callback={manejarCallback}
      locale={{
        back: "Atrás",
        close: "Cerrar",
        last: "Entendido",
        next: "Siguiente",
        // Clave APARTE de "next" que usa react-joyride solo cuando
        // showProgress=true -- sin esto, el botón se queda en inglés
        // ("Next (Step X of Y)") aunque "next" ya esté traducido (bug real
        // visto en vivo, 2026-09-15).
        nextLabelWithProgress: "Siguiente (paso {step} de {steps})",
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

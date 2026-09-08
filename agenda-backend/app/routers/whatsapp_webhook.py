"""
Webhook entrante de Twilio WhatsApp: asignar tareas por WhatsApp sin tener
que abrir la app (2026-08-27, a petición de Yue -- puente de transición
para quien hoy vive en WhatsApp; NO reemplaza la app, ver CLAUDE.md sección
1 "El asistente debe reemplazar la UI").

Piloto DELIBERADAMENTE acotado (confirmado por Yue el 2026-08-27):
- Solo los números en settings.whatsapp_asignador_tareas_telefonos (hoy:
  solo Bernardo) pueden ASIGNAR tareas -- falla cerrado: lista vacía =
  nadie pasa.
- Solo la acción crear_entregable -- cualquier otra interpretación del LLM
  se rechaza con un mensaje explicativo, nunca se ejecuta otra cosa.
- El destinatario debe estar en el equipo directo de quien escribe, O un
  nivel abajo de cualquiera de sus reportes directos (2026-08-28, a
  petición de Yue: "si Bernardo quiere asignar algo a Juan José que está
  dentro del equipo de David, como David está en el equipo de Bernardo eso
  sí debería estar permitido" -- mismo alcance que ya tiene el selector
  anidado de la UI, ver listar_equipo_de_subordinado en
  app/services/equipos.py, reusado tal cual, sin duplicar la regla). La
  notificación al supervisor real (David, en el ejemplo) ya la manda sola
  crear_entregable -- ver _notificar_supervisor_de_asignacion en
  app/services/entregables.py, no hace falta nada nuevo aquí.

Al responsable SIEMPRE le llega un WhatsApp con la tarea (sin importar si
es "urgente" -- a diferencia del resto del sistema, ver
app/services/entregables.py::crear_entregable, que solo manda WhatsApp si
es urgente) con un código de referencia para poder marcarla completada
sin abrir la app: responder "LISTO #<id>". A diferencia de "asignar", esto
NO está restringido a ningún allowlist -- cualquier persona con
telefono_whatsapp configurado puede completar sus PROPIAS tareas así,
porque reusa el mismo permiso real de siempre (actualizar_avance exige ser
el responsable o N1/N2 del proyecto, ver puede_actualizar_avance_entregable
en app/core/permissions.py) -- no es una puerta nueva, solo un canal nuevo
para una acción que la persona ya podía hacer.

Nota conocida del piloto: si la tarea también resulta "urgente" por la
regla ya existente (vence en ≤3 días), el responsable puede recibir DOS
WhatsApp -- el genérico de siempre (sin código) más este (con código) --
se aceptó como limitación menor en vez de tocar la lógica de urgencia
compartida por todos los canales (voz, UI, WhatsApp) solo para este caso.

Reusa el MISMO pipeline del asistente de voz (interpretar_instruccion +
TOOLS["crear_entregable"], ver app/services/asistente/) -- no hay NLU
nueva, solo un canal de entrada distinto. A diferencia de
/asistente/interpretar (dos pasos, con confirmación explícita en la UI),
aquí se ejecuta directo tras resolver: un webhook de WhatsApp no tiene una
forma natural de pedir "confirmas?" en varios turnos sin construir un
manejo de conversación con estado (el pipeline del asistente es stateless
a propósito). El mensaje de vuelta ya funciona como confirmación de lo que
se hizo. Si el resolver pide una aclaración (ej. falta la fecha), se le
pide a la persona que reescriba el mensaje completo -- no se intenta
sostener una conversación de varios turnos en este piloto.

Este endpoint NO usa JWT (Twilio no manda Bearer token). La identidad se
resuelve por número de teléfono (Usuario.telefono_whatsapp) y la llamada
en sí se autentica validando la firma de Twilio (X-Twilio-Signature) con
TWILIO_AUTH_TOKEN -- sin esto, cualquiera que adivine la URL podría
hacerse pasar por un mensaje entrante de Bernardo.
"""
import logging
import re
from typing import Optional

import requests
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session
from twilio.request_validator import RequestValidator

from app.core.config import settings
from app.database import get_db
from app.models.entregable import Entregable
from app.models.usuario import Usuario
from app.services.asistente.interprete import interpretar_instruccion
from app.services.asistente.tools import TOOLS
from app.services.asistente.whisper_client import transcribir as transcribir_audio
from app.services.entregables import actualizar_avance
from app.services.equipos import listar_equipo_de_subordinado, listar_mi_equipo_efectivo

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks/whatsapp", tags=["Webhook WhatsApp"])

_MENSAJE_AYUDA = (
    'Por ahora, desde WhatsApp solo puedo crear tareas nuevas para tu equipo. '
    'Intenta algo como: "Crea una tarea para Juan: revisar el reporte, para el viernes".'
)

# "LISTO #123" (con o sin "#", espacios de más, mayúsculas/minúsculas) para
# marcar una tarea como completada sin abrir la app -- el código es el id
# del entregable, el mismo que se le manda a la persona en el WhatsApp de
# asignación.
_PATRON_COMPLETAR = re.compile(r"^\s*listo\s*#?\s*(\d+)\s*$", re.IGNORECASE)


def _telefonos_permitidos() -> set[str]:
    return {t.strip() for t in settings.whatsapp_asignador_tareas_telefonos.split(",") if t.strip()}


def _normalizar_numero(numero_twilio: str) -> str:
    return numero_twilio.removeprefix("whatsapp:").strip()


def _respuesta_twiml(mensaje: str) -> Response:
    # TwiML mínimo a mano -- una sola etiqueta <Message>, no amerita traer
    # el helper MessagingResponse de Twilio para esto.
    cuerpo = (
        mensaje.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    )
    xml = f'<?xml version="1.0" encoding="UTF-8"?><Response><Message>{cuerpo}</Message></Response>'
    return Response(content=xml, media_type="application/xml")


async def _leer_formulario_validado(request: Request) -> dict:
    """Verifica X-Twilio-Signature contra la URL pública + el cuerpo del
    POST (documentación oficial de Twilio) antes de confiar en nada del
    payload."""
    formulario = await request.form()
    datos = {clave: str(valor) for clave, valor in formulario.items()}
    firma = request.headers.get("X-Twilio-Signature", "")
    url = settings.whatsapp_webhook_url_publica or str(request.url)
    validador = RequestValidator(settings.twilio_auth_token)
    if not validador.validate(url, datos, firma):
        raise HTTPException(status_code=403, detail="Firma de Twilio inválida")
    return datos


def _en_equipo_extendido(db: Session, usuario: Usuario, responsable_id: int) -> bool:
    """Equipo directo de `usuario`, o un nivel abajo de cualquiera de sus
    reportes directos -- mismo alcance que el selector anidado de la UI
    ("¿A quién le quieres asignar...?"), reusando listar_equipo_de_subordinado
    tal cual (ya valida por su cuenta que cada miembro sea reporte directo
    real de `usuario` antes de expandir su equipo)."""
    equipo_directo = listar_mi_equipo_efectivo(db, usuario)
    if any(m.usuario_id == responsable_id for m in equipo_directo):
        return True
    for miembro in equipo_directo:
        try:
            subequipo = listar_equipo_de_subordinado(db, usuario, miembro.usuario_id)
        except HTTPException:
            continue
        if any(sm.usuario_id == responsable_id for sm in subequipo):
            return True
    return False


def _marcar_completada_mensaje(db: Session, usuario: Usuario, entregable_id: int) -> str:
    entregable = db.query(Entregable).filter(Entregable.id == entregable_id).first()
    if entregable is None:
        return f"No encontré ninguna tarea con el número #{entregable_id}."
    if entregable.responsable_id != usuario.id:
        # No revela si la tarea existe/de quién es -- mismo criterio de
        # discreción que el resto del sistema con lo que no te toca ver.
        return f"La tarea #{entregable_id} no está asignada a ti."

    try:
        actualizado = actualizar_avance(db, usuario, entregable_id, 100)
        db.commit()
    except HTTPException as exc:
        db.rollback()
        return str(exc.detail)

    return f'Listo, marqué "{actualizado.nombre}" como completada. ¡Bien hecho!'


def _procesar_asignar_tarea(db: Session, usuario: Usuario, texto: str) -> str:
    """Núcleo del flujo de "asignar tarea" (crear_entregable), sin nada
    específico de Twilio -- reusado por el webhook de Ultramsg. El llamador
    ya validó el allowlist antes de llegar aquí."""
    interpretado = interpretar_instruccion(db, usuario, texto)
    primera = interpretado["acciones"][0]

    if primera["tool"] != "crear_entregable":
        return _MENSAJE_AYUDA

    spec = TOOLS["crear_entregable"]
    try:
        resultado = spec.resolver(db, usuario, None, primera["parametros"], {})
    except HTTPException as exc:
        return str(exc.detail)

    if not resultado.listo:
        return f"{resultado.pregunta} Vuelve a escribirme con todo junto en un solo mensaje."

    responsable_id = resultado.parametros["responsable_id"]
    if not _en_equipo_extendido(db, usuario, responsable_id):
        return (
            "Por ahora solo puedo asignar tareas a alguien de tu equipo, o del equipo de "
            "alguien de tu equipo. Agrégalo primero en \"Mi equipo\" desde la app."
        )

    try:
        ejecucion = spec.ejecutar(db, usuario, resultado.parametros)
    except HTTPException as exc:
        return str(exc.detail)

    # Nota (2026-09-03): NO se manda WhatsApp aquí -- crear_entregable (el
    # service que ejecuta spec.ejecutar arriba) ya manda SIEMPRE su propio
    # aviso de asignación por WhatsApp (ver app/services/entregables.py::
    # mensaje_whatsapp_asignacion), con el mismo texto unificado
    # (asignador, tarea, fecha, hora, urgencia, comprobante, "LISTO #id" y
    # el link a la app) que usa cualquier otro camino de asignación.
    # Mandarlo también aquí duplicaría el mensaje.
    return ejecucion["mensaje"]


def procesar_mensaje_whatsapp(db: Session, numero: str, texto: str) -> Optional[str]:
    """Núcleo compartido de "WhatsApp entrante", independiente del proveedor
    (Twilio/Ultramsg) -- resuelve el usuario por teléfono, aplica el patrón
    "LISTO #id" (sin allowlist) o el flujo de asignar tarea (con allowlist),
    y devuelve el texto de respuesta. None = no responder nada (usuario no
    encontrado, o número no habilitado para asignar -- mismo criterio de
    discreción que el resto del webhook, no revela nada a quien no le toca)."""
    usuario = db.query(Usuario).filter(Usuario.telefono_whatsapp == numero).first()
    if usuario is None:
        logger.warning("WhatsApp entrante de número sin usuario con ese telefono_whatsapp: %s", numero)
        return None

    texto = texto.strip()

    # "Completar" no tiene allowlist -- cualquiera con telefono_whatsapp
    # configurado puede marcar SUS PROPIAS tareas, ver docstring del módulo.
    coincidencia = _PATRON_COMPLETAR.match(texto)
    if coincidencia:
        return _marcar_completada_mensaje(db, usuario, int(coincidencia.group(1)))

    # A partir de aquí, solo "asignar" -- sí tiene allowlist (hoy: Bernardo).
    if numero not in _telefonos_permitidos():
        logger.warning("WhatsApp entrante de número no habilitado para asignar tareas: %s", numero)
        return None

    if not texto:
        return _MENSAJE_AYUDA

    return _procesar_asignar_tarea(db, usuario, texto)


@router.post("")
async def whatsapp_entrante(request: Request, db: Session = Depends(get_db)):
    datos = await _leer_formulario_validado(request)

    numero = _normalizar_numero(datos.get("From", ""))
    texto = (datos.get("Body") or "").strip()

    # Nota de voz (2026-08-27) -- solo aplica al flujo de Twilio, Ultramsg
    # no maneja audio en este piloto. Se resuelve ANTES de
    # procesar_mensaje_whatsapp porque necesita transcribirse a texto
    # primero; el resto de la lógica (allowlist, LISTO, etc.) es la misma
    # para ambos proveedores.
    num_media = int(datos.get("NumMedia") or 0)
    if num_media > 0 and not texto:
        media_url = datos.get("MediaUrl0")
        content_type = datos.get("MediaContentType0", "audio/ogg")
        if not media_url or not content_type.startswith("audio/"):
            return _respuesta_twiml(_MENSAJE_AYUDA)
        try:
            respuesta_media = requests.get(
                media_url,
                auth=(settings.twilio_account_sid, settings.twilio_auth_token),
                timeout=30,
            )
            respuesta_media.raise_for_status()
            texto = transcribir_audio(respuesta_media.content, "nota_voz.ogg", content_type)
        except Exception:
            logger.exception("Fallo descargando/transcribiendo nota de voz de WhatsApp")
            return _respuesta_twiml("No pude escuchar tu nota de voz -- intenta de nuevo o mándalo por texto.")

    respuesta = procesar_mensaje_whatsapp(db, numero, texto)
    return _respuesta_twiml(respuesta or "")

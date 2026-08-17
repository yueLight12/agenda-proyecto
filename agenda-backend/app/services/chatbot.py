"""
Servicio del chatbot de consulta.

Por ahora es de solo lectura: arma un bloque de contexto con los datos que el
usuario YA puede ver (reutilizando query_entregables_visibles, la misma
función que usan los routers de entregables/resumen) y se lo pasa al LLM
configurado (Ollama local por default, o Gemini — ver
app/services/llm_cliente.py) para que redacte la respuesta en español. El
modelo nunca toca la base de datos ni decide qué es visible — eso ya lo
filtró este servicio. Si el proveedor es Gemini o Claude (ambos salen a
internet), el contexto y la pregunta se seudonimizan antes de mandarlos
(app/services/llm_privacidad.py) y los nombres reales se restauran en la
respuesta.
"""
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.permissions import query_entregables_visibles
from app.models.entregable import EstatusEntregable
from app.models.usuario import Usuario
from app.models.usuario_proyecto_rol import UsuarioProyectoRol
from app.services.llm_cliente import generar_texto
from app.services.llm_privacidad import construir_mapa
from app.services.rol_labels import etiqueta_rol

SYSTEM_PROMPT = """Eres el asistente de consulta de "Agenda Inteligente".
Respondes ÚNICAMENTE con base en los datos que se te dan en el bloque "DATOS
DISPONIBLES" a continuación. Nunca inventes temas, entregables o cifras
que no estén ahí. Si la pregunta no se puede responder con esos datos, dilo
claramente en vez de adivinar. Responde siempre en español, de forma breve
y directa.

Tu respuesta se muestra en pantalla Y se puede leer en voz alta, así que:
- NO uses formato markdown: nada de asteriscos para negritas, nada de "#"
  para títulos, nada de backticks. Escribe texto plano, como si hablaras.
- Si mencionas varios elementos (entregables, temas, reuniones), pon
  cada uno en su propia línea (con un salto de línea real entre ellos), no
  todos seguidos en la misma oración.
- Usa oraciones cortas y directas. Evita rodeos y frases de relleno."""


def _construir_contexto(db: Session, usuario: Usuario) -> str:
    """Arma el bloque de datos visibles para este usuario, en todos sus temas."""
    roles = (
        db.query(UsuarioProyectoRol)
        .filter(UsuarioProyectoRol.usuario_id == usuario.id)
        .all()
    )

    if not roles:
        return "El usuario no participa en ningún tema todavía."

    hoy = date.today()
    limite_alerta = hoy + timedelta(days=settings.dias_alerta_entregable)
    bloques = []

    for rol in roles:
        proyecto = rol.proyecto
        entregables = query_entregables_visibles(db, usuario, proyecto.id).all()

        total = len(entregables)
        cumplidos = sum(1 for e in entregables if e.estatus == EstatusEntregable.cumplido)
        vencidos = sum(
            1
            for e in entregables
            if e.estatus != EstatusEntregable.cumplido and e.fecha_entrega < hoy
        )
        proximos = sum(
            1
            for e in entregables
            if e.estatus != EstatusEntregable.cumplido
            and hoy <= e.fecha_entrega <= limite_alerta
        )
        avance_global = (
            sum(e.porcentaje_avance for e in entregables) / total if total > 0 else 0.0
        )

        lineas = [
            f'Tema "{proyecto.nombre}" (tu rol ahí: {etiqueta_rol(rol.rol)}):',
            f"  Resumen: {avance_global:.0f}% de avance global, {total} entregables "
            f"visibles para ti, {vencidos} vencidos, {proximos} próximos a vencer, "
            f"{cumplidos} cumplidos.",
        ]
        if entregables:
            lineas.append("  Entregables:")
            for e in entregables:
                responsable = e.responsable.nombre if e.responsable else "(sin asignar)"
                lineas.append(
                    f"    - \"{e.nombre}\" | responsable: {responsable} | "
                    f"vence: {e.fecha_entrega} | avance: {e.porcentaje_avance}% | "
                    f"estatus: {e.estatus.value}"
                )
        bloques.append("\n".join(lineas))

    return "\n\n".join(bloques)


def responder_pregunta(db: Session, usuario: Usuario, pregunta: str) -> str:
    """Arma el contexto visible del usuario y le pide al LLM configurado que
    responda."""
    contexto = _construir_contexto(db, usuario)
    nombre_para_prompt = usuario.nombre

    mapa = None
    if settings.asistente_llm_proveedor in ("gemini", "claude"):
        mapa = construir_mapa(db, usuario)
        contexto = mapa.redactar(contexto)
        pregunta = mapa.redactar(pregunta)
        # El nombre de quien pregunta no está cubierto por el mapa de forma
        # confiable (depende de si aparece como miembro de algún proyecto
        # visible) — más simple y seguro no mandarlo tal cual a la nube.
        nombre_para_prompt = "el usuario"

    prompt = (
        f"{SYSTEM_PROMPT}\n\n"
        f"DATOS DISPONIBLES:\n{contexto}\n\n"
        f"PREGUNTA DE {nombre_para_prompt}:\n{pregunta}\n\n"
        f"RESPUESTA:"
    )

    respuesta = generar_texto(prompt).strip()
    if mapa is not None:
        respuesta = mapa.restaurar(respuesta)
    return respuesta

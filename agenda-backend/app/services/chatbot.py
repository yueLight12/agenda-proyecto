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
from app.models.entregable import Entregable, EstatusEntregable
from app.models.historial_avance import HistorialAvance
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
- Usa oraciones cortas y directas. Evita rodeos y frases de relleno.

Cuando el usuario pregunte por SUS PENDIENTES, TAREAS o ENTREGABLES, cada uno
que menciones debe seguir este patrón, tomando los datos de la línea
correspondiente en "DATOS DISPONIBLES" (2026-08-20, a petición del cliente):
- "[quien lo asignó/agregó] te asignó/agregó [nombre del tema o entregable]"
  (usa el verbo que mejor calce: "asignó" para un entregable con responsable
  distinto de quien lo creó, "agregó" si se autoasignó).
- Si el dato dice que está CUMPLIDO: en vez de mencionar vencimiento, di
  "lo concluiste el [fecha en que se marcó cumplido]" (o "[nombre del
  responsable] lo concluyó el [fecha]" si hablas de otra persona). NO
  menciones si vence pronto o no -- ya no aplica.
  Si el dato no trae fecha de conclusión (no se pudo calcular), simplemente
  di que está concluido, sin inventar una fecha.
- Si NO está cumplido: menciona cuándo vence en términos relativos --
  "vence en N días", "vence hoy", o "venció hace N días" si ya pasó la
  fecha -- calculado a partir de la fecha de vencimiento y la fecha de hoy
  que aparecen en los datos."""


def _fechas_cumplido(db: Session, entregable_ids: list[int]) -> dict[int, date]:
    """Para cada entregable YA CUMPLIDO, la fecha (sin hora) del registro de
    HistorialAvance más reciente que llegó a 100% -- no existe un campo
    `fecha_cumplido` directo en Entregable (2026-08-20, decisión explícita
    con Yue: derivarlo del historial existente en vez de agregar una
    columna nueva). Una sola query batch para todos los ids, no N+1."""
    if not entregable_ids:
        return {}
    registros = (
        db.query(HistorialAvance)
        .filter(
            HistorialAvance.entregable_id.in_(entregable_ids),
            HistorialAvance.porcentaje_avance == 100,
        )
        .order_by(HistorialAvance.entregable_id, HistorialAvance.fecha_registro.desc())
        .all()
    )
    fechas: dict[int, date] = {}
    for r in registros:
        if r.entregable_id not in fechas:  # el primero por entregable ya es el más reciente
            fechas[r.entregable_id] = r.fecha_registro.date()
    return fechas


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
    bloques = [f"Hoy es {hoy}."]

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
            ids_cumplidos = [
                e.id for e in entregables if e.estatus == EstatusEntregable.cumplido
            ]
            fechas_cumplido = _fechas_cumplido(db, ids_cumplidos)
            # Nombres de quien creó cada entregable, en una sola query batch
            # (no N+1) -- solo hace falta para los que NO se autoasignaron.
            ids_creadores = {
                e.creado_por for e in entregables if e.creado_por != e.responsable_id
            }
            nombres_creadores = {
                u.id: u.nombre
                for u in db.query(Usuario).filter(Usuario.id.in_(ids_creadores)).all()
            } if ids_creadores else {}
            for e in entregables:
                responsable = e.responsable.nombre if e.responsable else "(sin asignar)"
                # "asignado por": quien lo creó, salvo que sea la misma
                # persona responsable (autoasignado) -- ver Entregable.creado_por.
                if e.creado_por == e.responsable_id:
                    asignado_por = f"{responsable} (se autoasignó)"
                else:
                    asignado_por = nombres_creadores.get(e.creado_por, "(desconocido)")
                linea = (
                    f"    - \"{e.nombre}\" | responsable: {responsable} | "
                    f"asignado por: {asignado_por} | avance: {e.porcentaje_avance}% | "
                    f"estatus: {e.estatus.value}"
                )
                if e.estatus == EstatusEntregable.cumplido:
                    fecha_cumplido = fechas_cumplido.get(e.id)
                    linea += (
                        f" | fecha en que se marcó cumplido: {fecha_cumplido}"
                        if fecha_cumplido
                        else " | fecha en que se marcó cumplido: (no disponible)"
                    )
                else:
                    linea += f" | vence: {e.fecha_entrega}"
                lineas.append(linea)
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

"""
Servicio del chatbot de consulta.

Por ahora es de solo lectura: arma un bloque de contexto con los datos que el
usuario YA puede ver (reutilizando query_entregables_visibles/
query_reuniones_visibles/query_reuniones_generales_visibles, las mismas
funciones que usan los routers de entregables/reuniones/resumen) y se lo
pasa al LLM configurado (Ollama local por default, o Gemini/Claude — ver
app/services/llm_cliente.py) para que redacte la respuesta en español. El
modelo nunca toca la base de datos ni decide qué es visible — eso ya lo
filtró este servicio. Si el proveedor es Gemini o Claude (ambos salen a
internet), el contexto y la pregunta se seudonimizan antes de mandarlos
(app/services/llm_privacidad.py) y los nombres reales se restauran en la
respuesta.

Reuniones (2026-08-26, cierra una brecha reportada por Yue: el asistente
decía "no tengo datos de reuniones" al preguntarle la agenda del día,
porque este contexto nunca las incluía) -- se limitan a una ventana de
"hoy + próximos 7 días" (mismo horizonte que ya usa el dashboard ejecutivo
para "reuniones próximas"), no todo el historial, para no inflar el
contexto con reuniones pasadas irrelevantes a una pregunta típica.
"""
from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.permissions import (
    query_entregables_visibles,
    query_reuniones_generales_visibles,
    query_reuniones_visibles,
)
from app.models.entregable import Entregable, EstatusEntregable
from app.models.historial_avance import HistorialAvance
from app.models.pendiente_personal import PendientePersonal
from app.models.reunion import Reunion
from app.models.usuario import Usuario
from app.models.usuario_proyecto_rol import UsuarioProyectoRol
from app.services.llm_cliente import generar_texto
from app.services.llm_privacidad import construir_mapa
from app.services.rendimiento import calcular_rendimiento_equipo, calcular_tasa_aprobacion
from app.services.rol_labels import etiqueta_rol

SYSTEM_PROMPT = """Eres el asistente de consulta de "Agenda Inteligente".
Respondes ÚNICAMENTE con base en los datos que se te dan en el bloque "DATOS
DISPONIBLES" a continuación. Nunca inventes temas, entregables o cifras
que no estén ahí. Si la pregunta no se puede responder con esos datos, dilo
claramente en vez de adivinar. Responde siempre en español, de forma breve
y directa.

Tono (2026-08-27, a petición de Yue: que no se sienta que le habla a una
máquina): contesta como lo haría un colega que ya revisó los datos y te
está platicando lo que encontró, NO como un reporte generado por un
sistema. Evita el registro de bitácora ("Entregable X: estatus pendiente,
vence en N días") -- di las cosas como se dirían en una conversación
("Te falta X, vence en N días"). Esto es sobre REGISTRO, no sobre agregar
palabras: sigue siendo breve, sin frases de relleno ni cortesías vacías
("¡Claro que sí!", "¡Por supuesto!") -- la calidez está en cómo se dice
la información, no en decir más.

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
  que aparecen en los datos.

Pregunta sobre TI MISMO (2026-09-02, a petición de Yue: que el usuario
pueda preguntar "¿qué puedes hacer?" y recibir una respuesta útil en vez
de "no tengo datos de eso") -- si el usuario pregunta qué puedes hacer, en
qué le ayudas, cómo te usa, o pide que lo guíes en algo (ej. "¿qué puedes
hacer?", "ayuda", "¿cómo creo una tarea?"), esto NO se responde con
"DATOS DISPONIBLES" -- describe tus capacidades reales:
- Consultar (lo que ya sabes hacer): pendientes, tareas y entregables (qué
  vence, qué está cumplido), reuniones de hoy o de la semana, avance de un
  proyecto o tema.
- Actuar (el usuario también puede pedirte que hagas cosas, no solo
  preguntar): crear, editar o eliminar tareas/entregables y proyectos;
  agendar, editar o eliminar reuniones (incluidas recurrentes); asignar
  roles; registrar acuerdos de una junta; anotar pendientes personales;
  dar de alta a alguien en su equipo; entre otras. SIEMPRE te muestra un
  resumen para confirmar antes de ejecutar -- nunca actúas sin que la
  persona confirme primero.
Si preguntan CÓMO hacer algo puntual, dales un ejemplo concreto de lo que
pueden decir en vez de una explicación abstracta -- ej. para "¿cómo creo
una tarea?": 'dile algo como "asígnale a Juan la tarea de mandar el
reporte para el viernes" y te muestro un resumen para confirmar antes de
crearla'.

Preguntas sobre RENDIMIENTO DEL EQUIPO (2026-09-07, a petición de Yue: no
había forma de preguntarle esto al asistente por voz, solo se veía en el
dashboard) -- si preguntan cosas como "¿quién tiene más tareas vencidas?",
"¿cómo va el equipo este mes?", "¿cuál es la tasa de aprobación de
Fulano?" o "¿quién entrega más rápido?", usa el bloque "Rendimiento del
equipo (mes actual)" de DATOS DISPONIBLES -- ya trae los números
agregados por persona (completadas, a tiempo/tarde, vencidas, tasa de
aprobación), no los calcules tú ni sumes/comparés cifras de otras partes
del contexto para esto. Si ese bloque no aparece o no incluye a alguien,
dilo en vez de adivinar."""


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


def _lineas_reuniones(reuniones, encabezado: str) -> list[str]:
    """Formatea un bloque de reuniones para el contexto del chatbot -- mismo
    espíritu que las líneas de entregables: una por reunión, con lo que hace
    falta para responder "¿qué reuniones tengo hoy/esta semana?" sin que el
    LLM tenga que inventar nada. `reuniones` ya viene ordenada."""
    if not reuniones:
        return []
    lineas = [encabezado]
    for r in reuniones:
        organizador = r.organizador.nombre if r.organizador else "(desconocido)"
        lineas.append(
            f'    - "{r.titulo}" | inicio: {r.fecha_inicio.strftime("%Y-%m-%d %H:%M")} | '
            f"duración: {r.duracion_minutos} min | organizador: {organizador}"
        )
    return lineas


def _bloque_rendimiento_equipo(db: Session, usuario: Usuario) -> str | None:
    """Resumen por persona (mes actual) para que el chatbot pueda contestar
    preguntas de "rendimiento del equipo" (2026-09-07) -- reusa TAL CUAL
    los mismos cálculos que ya alimentan el dashboard de Rendimiento (ver
    app/services/rendimiento.py), sobre el mismo conjunto de entregables
    visibles para este usuario. Sin esto, el LLM tendría que sumar/comparar
    cifras él mismo a partir de la lista larga de entregables por tema, que
    es exactamente el tipo de cálculo que ya sabemos que hace mal (ver el
    bug de "qué día es hoy" más arriba) -- aquí ya llega precalculado."""
    personas = calcular_rendimiento_equipo(db, usuario, "mes")
    if not personas:
        return None
    aprobacion_por_id = {
        p["usuario_id"]: p for p in calcular_tasa_aprobacion(db, usuario, "mes")
    }

    lineas = ["Rendimiento del equipo (mes actual, resumen por persona):"]
    for p in personas:
        linea = (
            f'    - {p["nombre"]}: {p["completadas"]} completada(s) '
            f'({p["a_tiempo"]} a tiempo, {p["tarde"]} tarde), '
            f'{p["pendientes_actuales"]} pendiente(s) activa(s), '
            f'{p["vencidas"]} vencida(s)'
        )
        if p["vencidas"] > 0:
            linea += f' (hasta {p["dias_atraso_max"]} día(s) de atraso)'
        aprob = aprobacion_por_id.get(p["usuario_id"])
        if aprob and aprob["tasa_aprobacion"] is not None:
            linea += (
                f', tasa de aprobación en "visto bueno": {aprob["tasa_aprobacion"]}% '
                f'({aprob["aprobadas"]} aprobada(s), {aprob["rechazadas"]} rechazada(s))'
            )
        lineas.append(linea + ".")
    return "\n".join(lineas)


def _construir_contexto(db: Session, usuario: Usuario) -> str:
    """Arma el bloque de datos visibles para este usuario, en todos sus temas."""
    roles = (
        db.query(UsuarioProyectoRol)
        .filter(UsuarioProyectoRol.usuario_id == usuario.id)
        .all()
    )

    hoy = date.today()
    limite_alerta = hoy + timedelta(days=settings.dias_alerta_entregable)
    # Ventana de reuniones a incluir (2026-08-26, cierra la brecha
    # reportada por Yue: el asistente decía "no tengo datos de reuniones"
    # porque este contexto nunca las incluía, solo entregables) -- desde el
    # inicio de hoy (para que "qué reuniones tuve hoy" incluya las que ya
    # pasaron) hasta 7 días adelante, mismo horizonte que ya usa el
    # dashboard ejecutivo para "reuniones próximas" (ver app/routers/dashboard.py).
    inicio_hoy = datetime.combine(hoy, datetime.min.time())
    limite_reuniones = datetime.utcnow() + timedelta(days=7)

    reuniones_generales = (
        query_reuniones_generales_visibles(db, usuario)
        .filter(Reunion.fecha_inicio >= inicio_hoy, Reunion.fecha_inicio <= limite_reuniones)
        .order_by(Reunion.fecha_inicio)
        .all()
    )

    # Bug real (2026-09-02, reportado por Yue: el asistente dijo "hoy es
    # martes" un miércoles) -- antes solo se mandaba la fecha ISO ("Hoy es
    # 2026-09-02.") y se le dejaba al LLM calcular qué día de la semana es,
    # cosa que los modelos hacen mal de forma consistente (no es un problema
    # de qué modelo/proveedor esté configurado). Se calcula aquí con
    # `date.weekday()`, sin depender del locale del sistema.
    _dias_es = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
    bloques = [f"Hoy es {_dias_es[hoy.weekday()]}, {hoy}."]

    # Bug real (2026-09-03, reportado por Yue: le pidió al asistente sus
    # "pendientes personales" y contestó "no tengo datos" a pesar de tener
    # varios en la app) -- mismo tipo de brecha que las reuniones (ver
    # comentario arriba): este contexto nunca incluía PendientePersonal,
    # solo entregables/reuniones. 100% privados de este usuario, sin
    # ninguna regla de permisos de por medio (ver
    # app/models/pendiente_personal.py) -- se listan los que aún no están
    # hechos, más los recientes ya hechos quedan fuera para no inflar el
    # contexto con historial que no suele preguntarse.
    pendientes_personales = (
        db.query(PendientePersonal)
        .filter(PendientePersonal.usuario_id == usuario.id, PendientePersonal.hecho.is_(False))
        .order_by(PendientePersonal.fecha_limite.asc().nullslast())
        .all()
    )
    if pendientes_personales:
        lineas_pp = ["Pendientes personales (privados, solo tuyos, no son tareas de proyecto):"]
        for p in pendientes_personales:
            linea = f'    - "{p.contenido}"'
            if p.fecha_limite:
                hora_txt = f" {p.hora_limite.strftime('%H:%M')}" if p.hora_limite else ""
                linea += f" | fecha límite: {p.fecha_limite}{hora_txt}"
            if p.recurrencia != "ninguna":
                linea += f" | se repite: {p.recurrencia}"
            lineas_pp.append(linea)
        bloques.append("\n".join(lineas_pp))

    bloque_rendimiento = _bloque_rendimiento_equipo(db, usuario)
    if bloque_rendimiento:
        bloques.append(bloque_rendimiento)

    if not roles:
        bloques.append("El usuario no participa en ningún tema todavía.")
        lineas_generales = _lineas_reuniones(reuniones_generales, "Reuniones generales (sin tema) esta semana:")
        if lineas_generales:
            bloques.append("\n".join(lineas_generales))
        return "\n\n".join(bloques)

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
                    hora_txt = f" {e.hora_entrega.strftime('%H:%M')}" if e.hora_entrega else ""
                    linea += f" | vence: {e.fecha_entrega}{hora_txt}"
                lineas.append(linea)

        reuniones_tema = (
            query_reuniones_visibles(db, usuario, proyecto.id)
            .filter(Reunion.fecha_inicio >= inicio_hoy, Reunion.fecha_inicio <= limite_reuniones)
            .order_by(Reunion.fecha_inicio)
            .all()
        )
        lineas.extend(_lineas_reuniones(reuniones_tema, "  Reuniones esta semana:"))

        bloques.append("\n".join(lineas))

    lineas_generales = _lineas_reuniones(reuniones_generales, "Reuniones generales (sin tema) esta semana:")
    if lineas_generales:
        bloques.append("\n".join(lineas_generales))

    return "\n\n".join(bloques)


def responder_pregunta(db: Session, usuario: Usuario, pregunta: str) -> str:
    """Arma el contexto visible del usuario y le pide al LLM configurado que
    responda."""
    contexto = _construir_contexto(db, usuario)
    # El nombre de quien pregunta se manda siempre tal cual (2026-09-01, a
    # petición de Yue) -- es el propio usuario preguntando por sus propios
    # datos, no hay tercero que proteger, y sin esto el LLM no podía
    # distinguir "mis tareas" de las de cualquier otro en el mismo tema.
    nombre_para_prompt = usuario.nombre

    mapa = None
    if settings.asistente_llm_proveedor in ("gemini", "claude"):
        mapa = construir_mapa(db, usuario)
        contexto = mapa.redactar(contexto)
        pregunta = mapa.redactar(pregunta)

    # SYSTEM_PROMPT se manda aparte, como bloque cacheable (2026-09-03, a
    # petición de Yue: bajar el tiempo de esta ruta) -- es idéntico en
    # cada llamada, a diferencia de "DATOS DISPONIBLES" (cambia con cada
    # usuario/pregunta). Mismo mecanismo que ya usa el intérprete de
    # comandos, ver app/services/llm_cliente.py::generar_texto/_llamar_claude.
    prompt = (
        f"DATOS DISPONIBLES:\n{contexto}\n\n"
        f"PREGUNTA DE {nombre_para_prompt}:\n{pregunta}\n\n"
        f"RESPUESTA:"
    )

    respuesta = generar_texto(prompt, sistema=SYSTEM_PROMPT).strip()
    if mapa is not None:
        respuesta = mapa.restaurar(respuesta)
    return respuesta

"""
Seudonimización de nombres reales (personas y proyectos) antes de mandarlos
a un LLM en la nube (Gemini) — sustituye por placeholders genéricos
("PERSONA_1", "PROYECTO_1", ...) antes de enviar, y traduce de vuelta la
respuesta después. Se aplica en app/services/asistente/interprete.py y en
app/services/chatbot.py, solo cuando settings.asistente_llm_proveedor ==
"gemini" (con Ollama local no hace falta, nada sale de la red).

Límite conocido, no resuelto: esto protege la parte ESTRUCTURADA que el
sistema ya conoce de antemano (equipo y proyectos visibles para el usuario).
NO protege contenido libre que el propio usuario redacta — el texto de una
nota o de un acuerdo, por ejemplo, se manda tal cual, porque no hay forma
confiable de anonimizar automáticamente prosa arbitraria sin arriesgar
perder el sentido.
"""
import re
from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from app.models.usuario import Usuario
from app.services.proyectos import listar_equipo_visible, listar_proyectos_visibles

_RE_PLACEHOLDER = re.compile(r"\b(?:PERSONA|PROYECTO)_\d+\b", re.IGNORECASE)


@dataclass
class MapaSeudonimos:
    # (texto real, placeholder), ordenado de nombre más largo a más corto
    # para que "Juan Jose Flores Sedano" se sustituya antes que "Juan" suelto.
    patrones: list[tuple[str, str]] = field(default_factory=list)
    # placeholder en minúsculas -> texto real a restaurar
    texto_a_real: dict[str, str] = field(default_factory=dict)

    def redactar(self, texto: str) -> str:
        resultado = texto
        for real, placeholder in self.patrones:
            resultado = re.sub(rf"\b{re.escape(real)}\b", placeholder, resultado, flags=re.IGNORECASE)
        return resultado

    def restaurar(self, valor):
        if isinstance(valor, str):
            return _RE_PLACEHOLDER.sub(
                lambda m: self.texto_a_real.get(m.group(0).upper(), m.group(0)), valor
            )
        if isinstance(valor, dict):
            return {clave: self.restaurar(v) for clave, v in valor.items()}
        if isinstance(valor, list):
            return [self.restaurar(v) for v in valor]
        return valor


def construir_mapa(db: Session, usuario: Usuario) -> MapaSeudonimos:
    """Enumera los proyectos y el equipo visibles para ESTE usuario (mismas
    funciones de visibilidad de siempre — nunca una lista global) y arma el
    mapa de seudónimos para esa sesión."""
    proyectos = listar_proyectos_visibles(db, usuario)

    personas: dict[int, str] = {}
    for proyecto in proyectos:
        for miembro in listar_equipo_visible(db, usuario, proyecto.id):
            personas[miembro.usuario_id] = miembro.nombre

    patrones: list[tuple[str, str]] = []
    texto_a_real: dict[str, str] = {}

    for i, proyecto in enumerate(proyectos, start=1):
        placeholder = f"PROYECTO_{i}"
        patrones.append((proyecto.nombre, placeholder))
        texto_a_real[placeholder] = proyecto.nombre

    for i, (usuario_id, nombre) in enumerate(personas.items(), start=1):
        placeholder = f"PERSONA_{i}"
        primer_nombre = nombre.split()[0]
        patrones.append((nombre, placeholder))
        if primer_nombre.lower() != nombre.lower():
            patrones.append((primer_nombre, placeholder))
        texto_a_real[placeholder] = primer_nombre

    patrones.sort(key=lambda par: -len(par[0]))
    return MapaSeudonimos(patrones=patrones, texto_a_real=texto_a_real)

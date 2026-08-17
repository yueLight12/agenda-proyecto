"""
Modelo de Reunión: agendar reuniones u otros eventos dentro de un proyecto
(distinto de un Entregable, no lleva avance ni fecha límite), o reuniones
"generales" sin proyecto (proyecto_id NULL, 2026-08-16 -- pendiente desde
2026-08-10, ahora pedido explícitamente por el cliente).

Visibilidad (ver app.core.permissions.query_reuniones_visibles):
- N1 del proyecto (local o heredado del árbol de temas) ve TODAS las
  reuniones de ese proyecto/subárbol (igual que con entregables).
- El resto solo ve las reuniones en las que participa (organizador o
  invitado) -- esta es también la regla completa para reuniones generales
  (proyecto_id NULL): nadie es "N1 de nada" ahí, así que siempre aplica
  organizador-o-invitado, sin excepción.
"""
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.database import Base


class Reunion(Base):
    __tablename__ = "reuniones"

    id = Column(Integer, primary_key=True, index=True)
    proyecto_id = Column(Integer, ForeignKey("proyectos.id"), nullable=True)
    titulo = Column(String(200), nullable=False)
    notas = Column(Text, nullable=True)
    fecha_inicio = Column(DateTime, nullable=False)
    duracion_minutos = Column(Integer, default=30, nullable=False)
    organizador_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    fecha_creacion = Column(DateTime, default=datetime.utcnow, nullable=False)
    # Ocurrencia materializada de una serie recurrente (2026-08-17, ver
    # app/models/serie_reunion.py) -- None para una reunión suelta, sin
    # cambio de comportamiento. La agenda persistente/checklist de la serie
    # se resuelve por este id, no hay nada más que cambie aquí.
    # ON DELETE SET NULL: al borrar la serie (eliminar_serie), sus
    # ocurrencias YA materializadas sobreviven como reuniones sueltas
    # normales (documentado ahí) -- esto lo garantiza también a nivel de
    # base de datos, sin depender de que el código lo limpie a mano antes.
    serie_id = Column(
        Integer, ForeignKey("series_reunion.id", ondelete="SET NULL"), nullable=True
    )

    proyecto = relationship("Proyecto", back_populates="reuniones")
    serie = relationship("SerieReunion", back_populates="ocurrencias")
    organizador = relationship("Usuario", foreign_keys=[organizador_id])
    participantes = relationship(
        "ReunionParticipante", back_populates="reunion", cascade="all, delete-orphan"
    )
    minuta = relationship(
        "Minuta", back_populates="reunion", uselist=False, cascade="all, delete-orphan"
    )
    # OJO: nombrada distinto del Column `notas` de arriba a propósito — un
    # nombre igual (como estaba antes) hace que esta relación PISE al Column
    # en el atributo de Python (la última asignación en el cuerpo de la clase
    # gana), dejando `Reunion.notas` como una lista de Nota en vez de texto y
    # rompiendo crear_reunion/ReunionOut en cualquier llamada (encontrado
    # porque _ejecutar_agendar_reunion pasaba notas=None y tronaba con
    # "Incompatible collection type"). El texto libre de "notas" en el
    # formulario de reunión (ModalReunion.jsx) es el Column; esta relación es
    # el hilo de comentarios (SeccionNotas.jsx / tabla `notas`), otra cosa.
    notas_asociadas = relationship("Nota", back_populates="reunion", cascade="all, delete-orphan")
    # Checklist propio de esta reunión suelta (2026-08-17, ver
    # app/models/agenda_item.py) -- distinto de `creado_en_reunion_id` en
    # AgendaItem (esa es solo trazabilidad de dónde surgió un pendiente
    # dentro de una serie), por eso foreign_keys explícito en ambos lados.
    agenda_items = relationship(
        "AgendaItem",
        foreign_keys="AgendaItem.reunion_id",
        back_populates="reunion",
        cascade="all, delete-orphan",
    )


class ReunionParticipante(Base):
    __tablename__ = "reunion_participantes"

    id = Column(Integer, primary_key=True, index=True)
    reunion_id = Column(Integer, ForeignKey("reuniones.id"), nullable=False)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)

    reunion = relationship("Reunion", back_populates="participantes")
    usuario = relationship("Usuario")

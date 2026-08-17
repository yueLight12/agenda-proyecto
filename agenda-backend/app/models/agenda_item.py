"""
Modelo de agenda persistente para reuniones recurrentes: AgendaItem (la
lista fija de cosas a revisar en cada ocurrencia de una SerieReunion) y
AgendaItemRevision (la bitácora -- un registro por cada vez que se toca un
ítem en una ocurrencia puntual).

Diseño clave (confirmado con Yue, 2026-08-17): el "estado actual" de un
AgendaItem NUNCA se guarda como columna aparte -- se deriva siempre de su
AgendaItemRevision más reciente (o "pendiente" si nunca se ha revisado).
Así lo no revisado en una ocurrencia sigue apareciendo pendiente en la
siguiente automáticamente (arrastra estado), sin ningún job de reseteo, y
sin dos fuentes de verdad que puedan desincronizarse. Ver
app/services/series_reunion.py::agenda_actual_de_serie.

Visibilidad: un AgendaItem hereda la visibilidad de su serie (misma regla
que una Reunion) -- no se define ninguna regla nueva aquí, ver
app/services/series_reunion.py.
"""
import enum
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.database import Base


class TipoAgendaItem(str, enum.Enum):
    tema = "tema"  # referencia a un nodo del árbol de temas (proyecto_id)
    entregable = "entregable"
    acuerdo = "acuerdo"  # seguimiento a un acuerdo de una ocurrencia anterior
    pendiente = "pendiente"  # texto libre, sin entidad real detrás
    nota = "nota"  # referencia a una Nota ya existente sobre un tema (nota_id)


class EstadoRevision(str, enum.Enum):
    revisado = "revisado"
    pendiente = "pendiente"
    revisado_con_pendientes = "revisado_con_pendientes"


class AgendaItem(Base):
    __tablename__ = "agenda_items"

    id = Column(Integer, primary_key=True, index=True)
    serie_id = Column(Integer, ForeignKey("series_reunion.id"), nullable=False)
    tipo = Column(Enum(TipoAgendaItem), nullable=False)
    # Las 4 referencias de abajo usan ON DELETE SET NULL a propósito, única
    # excepción en este repo al patrón usual de "limpiar a mano en cada
    # servicio de eliminar" (ver Notificacion/AgendaItemRevision) -- un
    # AgendaItem representa la BITÁCORA de lo que se ha revisado a lo largo
    # de varias reuniones, así que borrar el tema/entregable/acuerdo que
    # referencia NO debe borrar ni bloquear el borrado de ese origen; el
    # ítem sobrevive con la referencia en null (ver
    # services/series_reunion.py::_nombre_agenda_item, cae a "(tema
    # eliminado)" etc.) en vez de arrastrar limpieza manual a cada lugar
    # del código que borra un proyecto/entregable/acuerdo/reunión.
    proyecto_id = Column(Integer, ForeignKey("proyectos.id", ondelete="SET NULL"), nullable=True)
    entregable_id = Column(
        Integer, ForeignKey("entregables.id", ondelete="SET NULL"), nullable=True
    )
    acuerdo_id = Column(
        Integer, ForeignKey("acuerdos_minuta.id", ondelete="SET NULL"), nullable=True
    )
    nota_id = Column(Integer, ForeignKey("notas.id", ondelete="SET NULL"), nullable=True)
    # Referencia a un Pendiente reutilizable (ver app/models/pendiente.py),
    # agregado para poder "jalar" un pendiente ya escrito en vez de
    # retipearlo -- mismo criterio ON DELETE SET NULL que las otras 3
    # referencias de arriba. Los AgendaItem tipo=pendiente creados ANTES de
    # esta columna se quedan sin ella (null) y siguen leyendo su contenido
    # de `texto` -- ver _nombre_agenda_item en services/series_reunion.py.
    pendiente_id = Column(
        Integer, ForeignKey("pendientes.id", ondelete="SET NULL"), nullable=True
    )
    # Bajo qué tema/subtema se agrupa este punto en el checklist -- INDEPENDIENTE
    # de `proyecto_id` (que para tipo=tema es el subtema que el ítem
    # REPRESENTA). Aplica a cualquier tipo (ej. un pendiente o una nota se
    # archivan bajo la sección "Suites"); un ítem tipo=tema no necesita
    # sección propia (el ítem ES la sección), se deja en null. Null en
    # cualquier otro tipo = sección "General" (reunión sin tema fijo).
    # Agregado 2026-08-17 para el checklist multi-tema de una junta general
    # (caso Diana) -- ver app/services/series_reunion.py.
    seccion_proyecto_id = Column(
        Integer, ForeignKey("proyectos.id", ondelete="SET NULL"), nullable=True
    )
    texto = Column(String(500), nullable=True)
    # Texto largo libre para pegar contenido de referencia (correo, tabla de
    # montos, link) -- complementa a `texto`, que es solo el título corto.
    detalle = Column(Text, nullable=True)
    orden = Column(Integer, default=0, nullable=False)
    activo = Column(Boolean, default=True, nullable=False)  # "archivado" si False
    # De qué ocurrencia salió este ítem (ej. un pendiente que surgió en la
    # plática) -- trazabilidad, no afecta permisos ni visibilidad.
    creado_en_reunion_id = Column(
        Integer, ForeignKey("reuniones.id", ondelete="SET NULL"), nullable=True
    )
    fecha_creacion = Column(DateTime, default=datetime.utcnow, nullable=False)

    serie = relationship("SerieReunion", back_populates="agenda_items")
    proyecto = relationship("Proyecto", foreign_keys=[proyecto_id])
    seccion = relationship("Proyecto", foreign_keys=[seccion_proyecto_id])
    entregable = relationship("Entregable")
    acuerdo = relationship("AcuerdoMinuta")
    nota = relationship("Nota")
    pendiente = relationship("Pendiente")
    creado_en_reunion = relationship("Reunion", foreign_keys=[creado_en_reunion_id])
    revisiones = relationship(
        "AgendaItemRevision", back_populates="agenda_item", cascade="all, delete-orphan"
    )


class AgendaItemRevision(Base):
    __tablename__ = "agenda_item_revisiones"

    id = Column(Integer, primary_key=True, index=True)
    agenda_item_id = Column(
        Integer, ForeignKey("agenda_items.id", ondelete="CASCADE"), nullable=False
    )
    # CASCADE a propósito (a diferencia de las columnas de AgendaItem de
    # arriba): una revisión SÍ es un hijo propiamente dicho de la reunión
    # puntual donde se registró -- no tiene sentido como bitácora huérfana
    # sin saber de qué ocurrencia salió. Cubre también el borrado en
    # cascada de un tema completo (eliminar_proyecto -> Proyecto.reuniones
    # -> cada Reunion), donde no hay un solo lugar de código que limpiar a
    # mano; Postgres lo garantiza sin importar el camino de borrado.
    reunion_id = Column(Integer, ForeignKey("reuniones.id", ondelete="CASCADE"), nullable=False)
    estado = Column(Enum(EstadoRevision), nullable=False)
    nota = Column(Text, nullable=True)
    registrado_por = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    fecha_registro = Column(DateTime, default=datetime.utcnow, nullable=False)

    agenda_item = relationship("AgendaItem", back_populates="revisiones")
    reunion = relationship("Reunion")
    usuario = relationship("Usuario", foreign_keys=[registrado_por])

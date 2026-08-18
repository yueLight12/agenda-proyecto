"""
Modelo de Nota: aviso/pendiente/comentario libre que puede colgar de UN
Entregable, UNA Reunión, UNA Minuta, UN Proyecto/tema, UNA Nota ya
existente (comentario anidado sobre un Aviso) o UN Pendiente ya existente
(comentario anidado sobre un Pendiente) — exactamente uno de los seis.

Visibilidad: una nota SIEMPRE hereda la visibilidad de su padre — no existe
una regla de "equipo" propia. Igual que Minuta/AcuerdoMinuta con Reunion
(ver app/models/minuta.py), la nota nunca calcula su propio permiso: el
servicio (app/services/notas.py) resuelve el padre y reutiliza
puede_ver_entregable/puede_editar_entregable,
puede_ver_reunion/puede_editar_reunion, o (para proyecto_id, agregado
2026-08-17 a petición de Yue -- caso Diana, "recordatorio suelto sobre un
tema") requerir_participacion_en_proyecto/obtener_rol_en_proyecto de
app.core.permissions. Una nota sobre un tema también puede jalarse como un
punto más del checklist de una junta recurrente (ver
AgendaItem.nota_id, app/models/agenda_item.py).

Comentarios anidados (nota_padre_id/pendiente_padre_id, 2026-08-18, a
petición de Yue: "si una nota/aviso/pendiente ya fue agregada, se le puede
anexar una imagen o dejar otro comentario y quede anidado"): un solo nivel
de anidamiento a propósito -- nota_padre_id/pendiente_padre_id siempre
apuntan a un Aviso o Pendiente RAÍZ (uno con proyecto_id), nunca a otro
comentario, para no complicar la UI con hilos de profundidad arbitraria
que nadie pidió. Un comentario hereda la visibilidad de su raíz (mismo
proyecto_id que ella), ver _puede_ver_padre en el servicio. Solo Avisos
(Nota) y Pendientes de Vista Equipo usan esto por ahora -- las notas de
entregables/reuniones/minutas no ganan esta opción en esta ronda.
"""
from datetime import datetime

from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.database import Base


class Nota(Base):
    __tablename__ = "notas"

    id = Column(Integer, primary_key=True, index=True)
    entregable_id = Column(Integer, ForeignKey("entregables.id"), nullable=True)
    reunion_id = Column(Integer, ForeignKey("reuniones.id"), nullable=True)
    minuta_id = Column(Integer, ForeignKey("minutas.id"), nullable=True)
    proyecto_id = Column(Integer, ForeignKey("proyectos.id"), nullable=True)
    # CASCADE: un comentario no tiene sentido huérfano si se borra su Aviso/
    # Pendiente raíz -- se va con él, mismo criterio que AgendaItemRevision
    # con su reunión (ver app/models/agenda_item.py).
    nota_padre_id = Column(Integer, ForeignKey("notas.id", ondelete="CASCADE"), nullable=True)
    pendiente_padre_id = Column(
        Integer, ForeignKey("pendientes.id", ondelete="CASCADE"), nullable=True
    )
    contenido = Column(Text, nullable=False)
    autor_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    # Ruta relativa (dentro del volumen de uploads, ver
    # app/services/almacenamiento.py) de UNA captura de pantalla adjunta a
    # la nota -- opcional, una sola imagen por nota (no una galería). None
    # = sin imagen. Servida solo vía GET /notas/{id}/imagen (hereda el
    # mismo permiso de ver la nota, nunca un mount estático público).
    imagen_path = Column(String(300), nullable=True)
    fecha_creacion = Column(DateTime, default=datetime.utcnow, nullable=False)

    entregable = relationship("Entregable", back_populates="notas")
    reunion = relationship("Reunion", back_populates="notas_asociadas")
    minuta = relationship("Minuta", back_populates="notas")
    proyecto = relationship("Proyecto", back_populates="notas")
    nota_padre = relationship(
        "Nota", remote_side=[id], foreign_keys=[nota_padre_id], back_populates="comentarios"
    )
    comentarios = relationship(
        "Nota", foreign_keys=[nota_padre_id], back_populates="nota_padre",
        cascade="all, delete-orphan",
    )
    pendiente_padre = relationship(
        "Pendiente", foreign_keys=[pendiente_padre_id], back_populates="comentarios"
    )
    autor = relationship("Usuario", foreign_keys=[autor_id])

    __table_args__ = (
        # Respaldo defensivo a nivel de base de datos — exactamente un padre
        # no nulo. La validación "amigable" (mensaje en español, 422 en vez
        # de un error de integridad crudo) vive en NotaCrear
        # (app/schemas/nota.py).
        CheckConstraint(
            "(CASE WHEN entregable_id IS NOT NULL THEN 1 ELSE 0 END + "
            "CASE WHEN reunion_id IS NOT NULL THEN 1 ELSE 0 END + "
            "CASE WHEN minuta_id IS NOT NULL THEN 1 ELSE 0 END + "
            "CASE WHEN proyecto_id IS NOT NULL THEN 1 ELSE 0 END + "
            "CASE WHEN nota_padre_id IS NOT NULL THEN 1 ELSE 0 END + "
            "CASE WHEN pendiente_padre_id IS NOT NULL THEN 1 ELSE 0 END) = 1",
            name="ck_nota_exactamente_un_padre",
        ),
    )

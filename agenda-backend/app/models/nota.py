"""
Modelo de Nota: aviso/pendiente/comentario libre que puede colgar de UN
Entregable, UNA Reunión o UNA Minuta (exactamente uno de los tres).

Visibilidad: una nota SIEMPRE hereda la visibilidad de su padre — no existe
una regla de "equipo" propia. Igual que Minuta/AcuerdoMinuta con Reunion
(ver app/models/minuta.py), la nota nunca calcula su propio permiso: el
servicio (app/services/notas.py) resuelve el padre y reutiliza
puede_ver_entregable/puede_editar_entregable o
puede_ver_reunion/puede_editar_reunion de app.core.permissions.
"""
from datetime import datetime

from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Integer, Text
from sqlalchemy.orm import relationship

from app.database import Base


class Nota(Base):
    __tablename__ = "notas"

    id = Column(Integer, primary_key=True, index=True)
    entregable_id = Column(Integer, ForeignKey("entregables.id"), nullable=True)
    reunion_id = Column(Integer, ForeignKey("reuniones.id"), nullable=True)
    minuta_id = Column(Integer, ForeignKey("minutas.id"), nullable=True)
    contenido = Column(Text, nullable=False)
    autor_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    fecha_creacion = Column(DateTime, default=datetime.utcnow, nullable=False)

    entregable = relationship("Entregable", back_populates="notas")
    reunion = relationship("Reunion", back_populates="notas_asociadas")
    minuta = relationship("Minuta", back_populates="notas")
    autor = relationship("Usuario", foreign_keys=[autor_id])

    __table_args__ = (
        # Respaldo defensivo a nivel de base de datos — exactamente un padre
        # no nulo. La validación "amigable" (mensaje en español, 422 en vez
        # de un error de integridad crudo) vive en NotaCrear
        # (app/schemas/nota.py).
        CheckConstraint(
            "(CASE WHEN entregable_id IS NOT NULL THEN 1 ELSE 0 END + "
            "CASE WHEN reunion_id IS NOT NULL THEN 1 ELSE 0 END + "
            "CASE WHEN minuta_id IS NOT NULL THEN 1 ELSE 0 END) = 1",
            name="ck_nota_exactamente_un_padre",
        ),
    )

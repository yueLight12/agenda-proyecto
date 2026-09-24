"""
Modelo de "Solicitud de ausencia" (2026-09-23, a petición de Yue): pedir
vacaciones/permiso/incapacidad, que el supervisor real lo apruebe o
rechace, y que -- solo si se aprueba -- aparezca como bloque en el
calendario de quien solicita, quien aprueba, y quien esté copiado.

`aprobador_id` se resuelve UNA vez al crear la solicitud (ver
app/services/equipos.py::resolver_supervisor_real) y se guarda fijo --
igual que ya hace HistorialResponsable con el entregable: si el organigrama
cambia después, la solicitud ya creada no debe "moverse sola" de aprobador.

No reusa Entregable ni Reunion a propósito: ninguno de los dos modela bien
"un rango de días que necesita aprobación explícita de UNA persona
concreta antes de ser real" -- una tarea no tiene aprobador fijo por
solicitud (usa N1/N2 del tema) y una reunión no tiene aprobación en
absoluto.
"""
import enum
from datetime import date, datetime

from sqlalchemy import Column, Date, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.database import Base


class TipoAusencia(str, enum.Enum):
    vacaciones = "vacaciones"
    permiso = "permiso"
    incapacidad = "incapacidad"


class EstatusSolicitudAusencia(str, enum.Enum):
    pendiente = "pendiente"
    aprobada = "aprobada"
    rechazada = "rechazada"


class SolicitudAusencia(Base):
    __tablename__ = "solicitudes_ausencia"

    id = Column(Integer, primary_key=True, index=True)
    solicitante_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    # Resuelto y fijado al crear -- ver docstring del módulo.
    aprobador_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    tipo = Column(Enum(TipoAusencia), nullable=False)
    fecha_inicio = Column(Date, nullable=False)
    fecha_fin = Column(Date, nullable=False)
    estatus = Column(
        Enum(EstatusSolicitudAusencia), default=EstatusSolicitudAusencia.pendiente, nullable=False
    )
    # Obligatoria al rechazar (mismo criterio que RechazarEntregableRequest
    # -- quien pide necesita saber por qué), vacía mientras esté pendiente
    # o si se aprobó.
    nota_rechazo = Column(Text, nullable=True)
    fecha_creacion = Column(DateTime, default=datetime.utcnow, nullable=False)
    fecha_resolucion = Column(DateTime, nullable=True)

    solicitante = relationship("Usuario", foreign_keys=[solicitante_id])
    aprobador = relationship("Usuario", foreign_keys=[aprobador_id])
    copiados = relationship(
        "SolicitudAusenciaCopiado", back_populates="solicitud", cascade="all, delete-orphan"
    )


class SolicitudAusenciaCopiado(Base):
    """Mismo concepto que EntregableCopiado (ver
    app/models/entregable_copiado.py): alguien que solo se entera -- aquí
    además, si la solicitud queda aprobada, también le aparece el bloque
    en su calendario (a diferencia del entregable copiado, que nunca gana
    ningún permiso nuevo más allá de la notificación)."""

    __tablename__ = "solicitud_ausencia_copiados"

    id = Column(Integer, primary_key=True, index=True)
    solicitud_id = Column(
        Integer, ForeignKey("solicitudes_ausencia.id", ondelete="CASCADE"), nullable=False
    )
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    fecha_creacion = Column(DateTime, default=datetime.utcnow, nullable=False)

    solicitud = relationship("SolicitudAusencia", back_populates="copiados")
    usuario = relationship("Usuario", foreign_keys=[usuario_id])

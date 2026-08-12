"""
Modelo de EventoEmpresa: cumpleaños, días festivos y eventos de la empresa.

Es el primer dato del sistema que NO es por proyecto (sin proyecto_id) —
visible a cualquier usuario logueado, sin pasar por las reglas de
app/core/permissions.py, porque no hay ningún alcance de proyecto que
filtrar (ver el docstring de app/routers/eventos_empresa.py).

La carga es manual y poco frecuente (ver cargar_eventos_empresa.py), no
hay UI para subir el archivo — decidido explícitamente con el cliente.
"""
import enum
from datetime import date, datetime

from sqlalchemy import Column, Date, DateTime, Enum, Integer, String, UniqueConstraint

from app.database import Base


class TipoEventoEmpresa(str, enum.Enum):
    cumpleanos = "cumpleanos"
    festivo = "festivo"
    evento = "evento"


class EventoEmpresa(Base):
    __tablename__ = "eventos_empresa"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(200), nullable=False)
    tipo = Column(Enum(TipoEventoEmpresa), nullable=False)
    # Fecha completa tal como se cargó (con el año que se tenga a mano).
    # Para cumpleanos/festivo, el servicio calcula la "próxima ocurrencia"
    # comparando solo mes/día contra hoy — ver
    # app/services/eventos_empresa.py. Un "evento" puntual se muestra en
    # esta fecha exacta, sin recalcular.
    fecha = Column(Date, nullable=False)
    fecha_creacion = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("nombre", "tipo", name="uq_evento_empresa_nombre_tipo"),
    )

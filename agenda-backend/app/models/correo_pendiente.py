"""
Bandeja de salida de correo, para el envío vía **Power Automate Desktop**
(2026-08-24, alternativa mientras TI no habilita el conector de Office
365 Outlook en Power Automate Cloud -- ver
app/services/email_cliente.py y CLAUDE.md).

El backend (en la Pi) no manda el correo directo: solo inserta una fila
aquí. Un flujo de Power Automate Desktop, corriendo en la laptop de Yue
con Outlook de escritorio abierto, consulta periódicamente los pendientes
(GET /integraciones/correos-pendientes) y los manda desde ahí, marcando
cada uno como enviado (POST .../marcar-enviado) para no repetirlos.
"""
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text

from app.database import Base


class CorreoPendiente(Base):
    __tablename__ = "correos_pendientes"

    id = Column(Integer, primary_key=True, index=True)
    destinatario_email = Column(String(255), nullable=False)
    asunto = Column(String(255), nullable=False)
    cuerpo_texto = Column(Text, nullable=False)
    enviado = Column(Boolean, default=False, nullable=False, index=True)
    fecha_creacion = Column(DateTime, default=datetime.utcnow, nullable=False)
    fecha_enviado = Column(DateTime, nullable=True)

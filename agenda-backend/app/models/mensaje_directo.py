"""
Modelo de MensajeDirecto: mensaje persona-a-persona, sin ningún proyecto/
entregable/reunión de por medio (2026-09-19, a petición de Yue: "Iván le
quiere pedir archivos a Juan, no tiene nada que ver con ningún proyecto,
¿eso cómo se hace hoy?" -- no había forma; toda comunicación existente
(Nota) cuelga de un padre con su propia regla de visibilidad heredada).

Visibilidad: NO se hereda de nada, es simplemente "eres el autor o el
destinatario de este mensaje" -- ver puede_ver_mensaje_directo en
app/services/mensajes_directos.py. Quién puede ENVIAR un mensaje directo a
quién reutiliza exactamente la misma audiencia que ya existe para
invitarse a una reunión general (listar_invitables_reunion con
proyecto_id=None, ver app/services/reuniones.py) -- mismo criterio de
riesgo bajo ya aceptado por Yue: "compañeros" que comparten un jefe N1/N2,
gente en tu "Mi equipo", o quien ya comparte un proyecto contigo. Nunca
alcanza a N4 (no aparece como "compañero" de nadie, mismo límite que ya
tiene _companeros_de_jefes).
"""
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, Text
from sqlalchemy.orm import relationship

from app.database import Base


class MensajeDirecto(Base):
    __tablename__ = "mensajes_directos"

    id = Column(Integer, primary_key=True, index=True)
    autor_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    destinatario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    contenido = Column(Text, nullable=False)
    fecha_creacion = Column(DateTime, default=datetime.utcnow, nullable=False)
    # Nulo mientras el destinatario no lo haya abierto de verdad -- mismo
    # patrón que Notificacion.fecha_leida ("acuse de vista", 2026-09-17).
    fecha_leido = Column(DateTime, nullable=True)

    autor = relationship("Usuario", foreign_keys=[autor_id])
    destinatario = relationship("Usuario", foreign_keys=[destinatario_id])

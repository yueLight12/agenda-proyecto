"""
Expone todos los modelos para que Base.metadata los detecte
(necesario para que create_all / Alembic los reconozca).
"""
from app.models.usuario import Usuario, RolEnum  # noqa: F401
from app.models.proyecto import Proyecto  # noqa: F401
from app.models.usuario_proyecto_rol import UsuarioProyectoRol  # noqa: F401
from app.models.entregable import Entregable, EstatusEntregable  # noqa: F401
from app.models.historial_avance import HistorialAvance  # noqa: F401
from app.models.notificacion import Notificacion, TipoNotificacion  # noqa: F401
from app.models.reunion import Reunion, ReunionParticipante  # noqa: F401
from app.models.equipo_miembro import EquipoMiembro  # noqa: F401
from app.models.minuta import Minuta, AcuerdoMinuta  # noqa: F401
from app.models.nota import Nota  # noqa: F401
from app.models.pendiente import Pendiente  # noqa: F401
from app.models.evento_empresa import EventoEmpresa, TipoEventoEmpresa  # noqa: F401
from app.models.serie_reunion import SerieReunion, SerieReunionParticipante  # noqa: F401
from app.models.agenda_item import AgendaItem, AgendaItemRevision, TipoAgendaItem, EstadoRevision  # noqa: F401
from app.models.suscripcion_push import SuscripcionPush  # noqa: F401
from app.models.historial_responsable import HistorialResponsable  # noqa: F401
from app.models.correo_pendiente import CorreoPendiente  # noqa: F401
from app.models.preferencia_usuario import PreferenciaUsuario  # noqa: F401
from app.models.pendiente_personal import PendientePersonal  # noqa: F401
from app.models.registro_auditoria import RegistroAuditoria  # noqa: F401
from app.models.configuracion_app import ConfiguracionApp  # noqa: F401
from app.models.termino_sensible import TerminoSensible  # noqa: F401
from app.models.correo_alterno import CorreoAlterno  # noqa: F401
from app.models.intento_fallido import IntentoFallido  # noqa: F401

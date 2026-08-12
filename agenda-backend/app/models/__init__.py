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
from app.models.evento_empresa import EventoEmpresa, TipoEventoEmpresa  # noqa: F401

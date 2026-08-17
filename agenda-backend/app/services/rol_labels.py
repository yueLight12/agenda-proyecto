"""
Traduce RolEnum (N1-N4) a las palabras en español que se muestran/leen en
voz alta -- las etiquetas N1-N4 quedaron descartadas de todo mensaje
generado por backend (ver CLAUDE.md). Vive en su propio módulo, sin
dependencias hacia app.services.tools ni app.services.chatbot, porque
ambos lo necesitan y tools.py ya importa de chatbot.py (un import inverso
crearía un ciclo).
"""
from app.models.usuario import RolEnum

_ETIQUETAS_ROL = {
    RolEnum.N1: "dirección",
    RolEnum.N2: "líder",
    RolEnum.N3: "colaborador interno",
    RolEnum.N4: "colaborador externo",
}


def etiqueta_rol(rol: RolEnum) -> str:
    return _ETIQUETAS_ROL.get(rol, rol.value)

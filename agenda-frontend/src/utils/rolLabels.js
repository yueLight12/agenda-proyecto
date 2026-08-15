// Traduce el rol interno (N1-N4, sigue usándose tal cual en toda la lógica
// de permisos del frontend y del backend) a la palabra que ve el usuario.
// Nunca cambiar los valores del enum en sí — solo esta etiqueta visual.
export const ROL_LABELS = {
  N1: "Dirección",
  N2: "Líder",
  N3: "Colaborador",
  N4: "Externo",
};

export const etiquetaRol = (rol) => ROL_LABELS[rol] || rol;

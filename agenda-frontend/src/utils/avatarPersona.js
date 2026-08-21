// Iniciales + color determinístico para avatares sin foto (2026-08-21,
// diseño "grafito" y avatar de topbar en AgendaPlanB.jsx) -- el sistema
// no tiene fotos de perfil, así que se usa un círculo con iniciales en vez
// de inventar/mostrar fotos falsas. El color se deriva del nombre (mismo
// hash simple en cada render, sin estado ni aleatoriedad) solo para que
// distintas personas se distingan visualmente en una lista, como el
// "Team Directory" de referencia -- no representa nada real (no hay
// concepto de "estado en línea" en este sistema).
const PALETA_AVATAR = ["#2dd6be", "#818cf8", "#f0a94e", "#e08277", "#6ee7b7", "#93c5fd"];

export function iniciales(nombre) {
  if (!nombre) return "";
  const partes = nombre.trim().split(/\s+/);
  const primera = partes[0]?.[0] || "";
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (primera + ultima).toUpperCase();
}

export function colorAvatar(nombre) {
  if (!nombre) return PALETA_AVATAR[0];
  let hash = 0;
  for (let i = 0; i < nombre.length; i++) {
    hash = (hash * 31 + nombre.charCodeAt(i)) % PALETA_AVATAR.length;
  }
  return PALETA_AVATAR[Math.abs(hash)];
}

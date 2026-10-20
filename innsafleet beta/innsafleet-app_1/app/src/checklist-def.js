// Definición del checklist de salida (la misma lista se manda al navegador)
const FUEL = ['Vacío', '1/4', '1/2', '3/4', 'Lleno'];
const LEVELS = ['Bajo', 'Normal', 'Lleno'];
const FLUIDS = [
  { id: 'aceite', label: 'Aceite de motor', blocks: true },
  { id: 'refri', label: 'Refrigerante', blocks: true },
  { id: 'frenos', label: 'Líquido de frenos', blocks: true },
  { id: 'dir', label: 'Dirección hidráulica', blocks: false },
  { id: 'limpia', label: 'Limpiaparabrisas', blocks: false },
  { id: 'def', label: 'AdBlue (DEF)', blocks: false },
];
const ZONES = [
  { id: 'frente', name: 'Frente', short: 'Frente', x: 140, y: 18, w: 144, h: 40 },
  { id: 'para', name: 'Parabrisas', short: 'Parabrisas', x: 150, y: 64, w: 124, h: 44 },
  { id: 'techo', name: 'Techo', short: 'Techo', x: 150, y: 150, w: 124, h: 110 },
  { id: 'tras', name: 'Trasera', short: 'Trasera', x: 140, y: 338, w: 144, h: 40 },
  { id: 'izqd', name: 'Lateral izquierdo delantero', short: 'Izq. del.', x: 36, y: 64, w: 80, h: 130 },
  { id: 'izqt', name: 'Lateral izquierdo trasero', short: 'Izq. tras.', x: 36, y: 206, w: 80, h: 150 },
  { id: 'derd', name: 'Lateral derecho delantero', short: 'Der. del.', x: 308, y: 64, w: 80, h: 130 },
  { id: 'dert', name: 'Lateral derecho trasero', short: 'Der. tras.', x: 308, y: 206, w: 80, h: 150 },
];
const CHECKS = [
  { id: 'luces', label: 'Luces delanteras y traseras', critical: true },
  { id: 'direc', label: 'Direccionales e intermitentes', critical: true },
  { id: 'frenos', label: 'Frenos de servicio y estacionamiento', critical: true },
  { id: 'llantas', label: 'Llantas y birlos', critical: true },
  { id: 'direccion', label: 'Dirección', critical: true },
  { id: 'puertas', label: 'Puerta de servicio y emergencia', critical: true },
  { id: 'cint', label: 'Cinturones de seguridad', critical: true },
  { id: 'extintor', label: 'Extintor y botiquín', critical: true },
  { id: 'claxon', label: 'Claxon', critical: false },
  { id: 'limpiad', label: 'Limpiadores', critical: false },
  { id: 'ac', label: 'Aire acondicionado', critical: false },
  { id: 'gps', label: 'GPS y cámara', critical: false },
];
const TIPOS_DANO = ['Golpe', 'Rayón', 'Cristal estrellado', 'Faltante', 'Otro'];
const SEVERIDADES = ['Menor', 'Grave'];

// Misma regla que la pantalla: fallas críticas o fluidos que bloquean => no apta
function veredicto({ combustible, fluidos, fallas, danos }) {
  const blockers = [];
  const notes = [];
  if (combustible <= 1) notes.push('Cargar combustible antes de salir');
  for (const f of FLUIDS) if (fluidos[f.id] === 'Bajo') (f.blocks ? blockers : notes).push(`${f.label} bajo`);
  for (const z of ZONES) {
    const d = danos[z.id];
    if (d && d.prev === 'Nuevo' && d.sev === 'Grave') notes.push(`Daño grave nuevo: ${z.name.toLowerCase()}`);
  }
  for (const ch of CHECKS) if (fallas[ch.id]) (ch.critical ? blockers : notes).push(`Falla: ${ch.label.toLowerCase()}`);
  const estado = blockers.length ? 'no_apta' : notes.length ? 'observaciones' : 'apta';
  return { estado, razones: blockers.concat(notes) };
}

module.exports = { FUEL, LEVELS, FLUIDS, ZONES, CHECKS, TIPOS_DANO, SEVERIDADES, veredicto };

// Reglas de operación (tabla configuracion) con respaldo en config/flota.js
const flota = require('../config/flota');

const DEFECTO = {
  precioDieselLitro: 0,
  toleranciaRetardoMin: 5,
  metaPuntualidadPct: 90,
  ralentiAlertaPct: 15,
  neumaticoCambiarMm: 3,
  neumaticoVigilarMm: 5,
  intervaloServicioKm: 10000,
  diasAvisoDocumentos: 45,
  radioParadaM: 80,
  limiteVelocidadKmh: 80,
  ...flota.reglas,
};

let cache = { hasta: 0, valor: null };

async function leerReglas(pool) {
  if (cache.valor && Date.now() < cache.hasta) return cache.valor;
  const r = await pool.query('SELECT clave, valor FROM configuracion');
  const m = Object.fromEntries(r.rows.map((x) => [x.clave, x.valor]));
  const reglas = { empresa: m.empresa || flota.empresa || 'Control de Patio' };
  for (const [k, def] of Object.entries(DEFECTO)) reglas[k] = m[k] != null ? Number(m[k]) : def;
  cache = { hasta: Date.now() + 30000, valor: reglas };
  return reglas;
}

function limpiarCache() {
  cache.hasta = 0;
}

module.exports = { leerReglas, limpiarCache, CLAVES: Object.keys(DEFECTO) };

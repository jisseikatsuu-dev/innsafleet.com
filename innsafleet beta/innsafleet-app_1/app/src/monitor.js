// =====================================================================
//  Monitor en segundo plano (corre dentro del servidor)
//   - Genera los viajes del día
//   - Cada N segundos lee Samsara (GPS, % tanque, odómetro, motor)
//   - Actualiza viajes, paradas, odómetros y excesos de velocidad
//   - Guarda la foto "en vivo" que consultan las pantallas
// =====================================================================
const pool = require('./db');
const samsara = require('./samsara');
const { leerReglas } = require('./reglas');
const { generarViajes, actualizarConGps } = require('./viajes');
const c = require('./calculos');

const INTERVALO = Number(process.env.MONITOR_SEG || 60) * 1000;
const vivo = { actualizado: null, porUnidad: new Map(), error: null };
let ultimaFechaGenerada = null;
let corriendo = false;
const ultimoExceso = new Map();

async function vuelta() {
  if (corriendo) return;
  corriendo = true;
  try {
    const hoy = c.hoyLocal();
    if (ultimaFechaGenerada !== hoy) {
      const n = await generarViajes(pool, hoy);
      await generarViajes(pool, c.sumarDias(hoy, 1)); // deja listos los de mañana
      ultimaFechaGenerada = hoy;
      if (n) console.log(`[monitor] ${n} viajes generados para ${hoy}`);
    }
    if (!samsara.hayToken()) return;

    const reglas = await leerReglas(pool);
    const unidades = await pool.query('SELECT unidad, samsara_id FROM unidades WHERE samsara_id IS NOT NULL AND activo');
    const porId = new Map(unidades.rows.map((u) => [u.samsara_id, u.unidad]));
    const stats = await samsara.statsActuales();

    const gpsPorUnidad = new Map();
    const odoPorUnidad = new Map();
    const porUnidad = new Map();
    for (const s of stats) {
      const unidad = porId.get(s.samsaraId);
      if (!unidad) continue;
      if (s.gps) gpsPorUnidad.set(unidad, s.gps);
      if (s.odometroKm) odoPorUnidad.set(unidad, s.odometroKm.valor);
      porUnidad.set(unidad, s);

      if (s.odometroKm) {
        await pool.query('UPDATE unidades SET odometro_km=$2 WHERE unidad=$1', [unidad, s.odometroKm.valor]);
      }
      // Exceso de velocidad (máximo uno cada 5 min por unidad)
      const kmh = s.gps?.velocidadKmh;
      if (kmh != null && kmh > reglas.limiteVelocidadKmh && Date.now() - (ultimoExceso.get(unidad) || 0) > 5 * 60000) {
        ultimoExceso.set(unidad, Date.now());
        await pool.query(
          'INSERT INTO excesos_velocidad (unidad, tiempo, kmh, limite_kmh, ubicacion) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
          [unidad, s.gps.tiempo || new Date(), kmh, reglas.limiteVelocidadKmh, s.gps.ubicacion || '']
        );
      }
    }

    await actualizarConGps(pool, gpsPorUnidad, odoPorUnidad, reglas);
    vivo.porUnidad = porUnidad;
    vivo.actualizado = new Date().toISOString();
    vivo.error = null;
  } catch (err) {
    vivo.error = err.message;
    console.error('[monitor]', err.message);
  } finally {
    corriendo = false;
  }
}

function iniciar() {
  if (process.env.MONITOR_DESACTIVADO === 'true') return;
  setTimeout(vuelta, 3000);
  setInterval(vuelta, INTERVALO).unref();
}

module.exports = { iniciar, vivo, vuelta };

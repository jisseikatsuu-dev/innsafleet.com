// =====================================================================
//  Sincronización programada con Samsara (Railway Cron Job / crontab EC2)
//
//  Uso:
//    node scripts/sync-samsara.js                       -> feed + reporte de ayer y hoy
//    node scripts/sync-samsara.js --solo-feed
//    node scripts/sync-samsara.js --solo-reporte
//    node scripts/sync-samsara.js --desde=2026-09-01 --hasta=2026-09-27   (rellenar histórico)
//    node scripts/sync-samsara.js --vehiculos           -> también re-vincula unidades
//
//  Railway: crea un servicio Cron con el mismo repo, comando
//    npm run sync
//  y horario, por ejemplo:  */30 * * * *
// =====================================================================
require('dotenv').config();
const pool = require('../src/db');
const samsara = require('../src/samsara');
const { syncReporte, syncFeed } = require('../src/sincronizacion');
const { hoyLocal, sumarDias } = require('../src/calculos');

const arg = (n) => {
  const a = process.argv.find((x) => x.startsWith(`--${n}=`));
  return a ? a.split('=')[1] : null;
};
const flag = (n) => process.argv.includes(`--${n}`);

async function main() {
  if (!samsara.hayToken()) {
    console.error('Falta SAMSARA_API_TOKEN.');
    process.exit(1);
  }
  const t0 = Date.now();

  if (flag('vehiculos')) {
    const r = await samsara.syncVehiculos(pool);
    console.log(`✔ Vehículos: ${r.vinculados} vinculados (${r.nuevos} nuevos) de ${r.totalSamsara} en Samsara`);
  }

  if (!flag('solo-reporte')) {
    const r = await syncFeed(pool);
    console.log(`✔ Feed: ${r.lecturas} lecturas en ${r.paginas} página(s)`);
  }

  if (!flag('solo-feed')) {
    const hoy = hoyLocal();
    const desde = arg('desde') || sumarDias(hoy, -1);
    const hasta = arg('hasta') || hoy;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta) || desde > hasta) {
      throw new Error('Rango inválido. Usa --desde=AAAA-MM-DD --hasta=AAAA-MM-DD');
    }
    const r = await syncReporte(pool, desde, hasta);
    console.log(`✔ Reporte combustible ${desde} → ${hasta}: ${r.filas} filas en ${r.dias} día(s)`);
  }

  console.log(`Listo en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error('✖ Sync falló:', err.message);
    pool.end();
    process.exit(1);
  });

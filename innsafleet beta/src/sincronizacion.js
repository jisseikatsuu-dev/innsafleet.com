// Lógica de sincronización compartida entre el dashboard (botones) y el cron.
const samsara = require('./samsara');
const { inicioDiaLocal, sumarDias, listaDias } = require('./calculos');

// Trae el reporte fuel-energy de Samsara día por día y lo guarda en rendimiento_diario.
async function syncReporte(pool, desde, hasta) {
  const unidades = await pool.query('SELECT unidad, samsara_id FROM unidades WHERE samsara_id IS NOT NULL');
  const nombrePorId = new Map(unidades.rows.map((r) => [r.samsara_id, r.unidad]));

  let filas = 0;
  const dias = listaDias(desde, hasta);
  for (const dia of dias) {
    const ini = inicioDiaLocal(dia).toISOString();
    const fin = inicioDiaLocal(sumarDias(dia, 1)).toISOString();
    const reporte = await samsara.reporteCombustible(ini, fin);

    for (const r of reporte) {
      if (!r.samsaraId || (r.distanciaKm === 0 && r.litros === 0)) continue;
      await pool.query(
        `INSERT INTO rendimiento_diario
           (fecha, samsara_id, unidad, distancia_km, litros, horas_motor, horas_ralenti, costo_estimado, moneda, actualizado_en)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
         ON CONFLICT (fecha, samsara_id) DO UPDATE SET
           unidad = EXCLUDED.unidad, distancia_km = EXCLUDED.distancia_km, litros = EXCLUDED.litros,
           horas_motor = EXCLUDED.horas_motor, horas_ralenti = EXCLUDED.horas_ralenti,
           costo_estimado = EXCLUDED.costo_estimado, moneda = EXCLUDED.moneda, actualizado_en = now()`,
        [
          dia,
          r.samsaraId,
          nombrePorId.get(r.samsaraId) || (r.nombre ? r.nombre.trim().toUpperCase() : null),
          r.distanciaKm.toFixed(2),
          r.litros.toFixed(2),
          r.horasMotor.toFixed(2),
          r.horasRalenti.toFixed(2),
          r.costo,
          r.moneda,
        ]
      );
      filas++;
    }
  }
  await guardarEstado(pool, 'reporte_ultima_corrida', new Date().toISOString());
  return { dias: dias.length, filas };
}

// Avanza el feed de stats (cursor persistido en sync_estado) y guarda lecturas crudas.
async function syncFeed(pool, maxPaginas = 50) {
  const r = await pool.query("SELECT valor FROM sync_estado WHERE clave = 'feed_cursor'");
  const cursor = r.rows[0]?.valor || null;

  const { lecturas, cursor: nuevo, paginas } = await samsara.leerFeed(cursor, maxPaginas);

  // Inserción por lotes
  const LOTE = 500;
  for (let i = 0; i < lecturas.length; i += LOTE) {
    const lote = lecturas.slice(i, i + LOTE);
    const valores = [];
    const params = [];
    lote.forEach((l, j) => {
      const b = j * 5;
      valores.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5})`);
      params.push(l.samsaraId, l.tipo, l.tiempo, l.valorNum, l.valorTxt);
    });
    await pool.query(
      `INSERT INTO lecturas_samsara (samsara_id, tipo, tiempo, valor_num, valor_txt)
       VALUES ${valores.join(',')}
       ON CONFLICT DO NOTHING`,
      params
    );
  }

  if (nuevo) await guardarEstado(pool, 'feed_cursor', nuevo);
  await guardarEstado(pool, 'feed_ultima_corrida', new Date().toISOString());

  // Limpieza: conserva N días de lecturas crudas
  const dias = Number(process.env.RETENCION_LECTURAS_DIAS || 90);
  await pool.query(`DELETE FROM lecturas_samsara WHERE tiempo < now() - ($1 || ' days')::interval`, [String(dias)]);

  return { lecturas: lecturas.length, paginas };
}

async function guardarEstado(pool, clave, valor) {
  await pool.query(
    `INSERT INTO sync_estado (clave, valor, actualizado_en) VALUES ($1, $2, now())
     ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_en = now()`,
    [clave, valor]
  );
}

module.exports = { syncReporte, syncFeed };

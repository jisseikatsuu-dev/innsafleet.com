// Crea las tablas y carga la operación desde config/flota.js
//   npm run seed                   -> inserta lo que falte (no pisa lo editado en el sistema)
//   npm run seed -- --sobrescribir -> vuelve a aplicar config/flota.js encima
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../src/db');
const flota = require('../config/flota');

const SOBRE = process.argv.includes('--sobrescribir');
const avisos = [];

async function main() {
  await pool.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  console.log('✔ Tablas creadas / verificadas');

  // Reglas
  for (const [k, v] of Object.entries(flota.reglas)) {
    await pool.query(
      `INSERT INTO configuracion (clave, valor) VALUES ($1, $2)
       ON CONFLICT (clave) DO ${SOBRE ? 'UPDATE SET valor = EXCLUDED.valor' : 'NOTHING'}`,
      [k, String(v)]
    );
  }
  await pool.query(
    `INSERT INTO configuracion (clave, valor) VALUES ('empresa', $1)
     ON CONFLICT (clave) DO ${SOBRE ? 'UPDATE SET valor = EXCLUDED.valor' : 'NOTHING'}`,
    [flota.empresa || 'Control de Patio']
  );
  if (!flota.reglas.precioDieselLitro) avisos.push('precioDieselLitro está en 0');

  // Choferes
  for (const c of flota.choferes || []) {
    await pool.query(
      `INSERT INTO choferes (nombre, telefono, licencia_vence) VALUES ($1, $2, $3)
       ON CONFLICT (nombre) DO ${SOBRE ? 'UPDATE SET telefono = EXCLUDED.telefono, licencia_vence = EXCLUDED.licencia_vence' : 'NOTHING'}`,
      [c.nombre, c.telefono || '', c.licenciaVence || null]
    );
  }
  if (!(flota.choferes || []).length) avisos.push('no hay choferes en config/flota.js');
  console.log(`✔ ${(flota.choferes || []).length} choferes`);

  // Unidades
  for (const u of flota.unidades) {
    const id = String(u.unidad).trim().toUpperCase();
    const t = flota.tipos[u.tipo] || {};
    const chofer = (flota.choferes || []).find((c) => c.unidad === id);
    const choferId = chofer ? (await pool.query('SELECT id FROM choferes WHERE nombre = $1', [chofer.nombre])).rows[0]?.id : null;
    await pool.query(
      `INSERT INTO unidades (unidad, tipo, capacidad, anio, placas, cliente, chofer_id, meta_kml, tanque_litros, psi_objetivo, poliza_vence)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (unidad) DO ${
         SOBRE
           ? `UPDATE SET tipo=EXCLUDED.tipo, capacidad=EXCLUDED.capacidad, anio=EXCLUDED.anio, placas=EXCLUDED.placas,
              cliente=EXCLUDED.cliente, chofer_id=COALESCE(EXCLUDED.chofer_id, unidades.chofer_id), meta_kml=EXCLUDED.meta_kml,
              tanque_litros=EXCLUDED.tanque_litros, psi_objetivo=EXCLUDED.psi_objetivo, poliza_vence=EXCLUDED.poliza_vence, actualizado_en=now()`
           : 'NOTHING'
       }`,
      [id, u.tipo, u.capacidad || t.capacidad || null, u.anio || null, u.placas || '', u.cliente || '', choferId || null,
       u.metaKml || t.metaKml || null, u.tanqueLitros || null, u.psiObjetivo || t.psiObjetivo || null, u.polizaVence || null]
    );
  }
  console.log(`✔ ${flota.unidades.length} unidades`);

  // Geocercas: plantas + otras
  const geos = [
    ...flota.plantas.map((p) => ({ ...p, tipo: 'PLANTA' })),
    ...(flota.geocercas || []).map((g) => ({ cliente: '', ...g })),
  ];
  for (const g of geos) {
    if (g.lat == null || g.lng == null) avisos.push(`geocerca "${g.nombre}" sin coordenadas`);
    await pool.query(
      `INSERT INTO geocercas (nombre, tipo, cliente, lat, lng, radio_m) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (nombre) DO ${SOBRE ? 'UPDATE SET tipo=EXCLUDED.tipo, cliente=EXCLUDED.cliente, lat=EXCLUDED.lat, lng=EXCLUDED.lng, radio_m=EXCLUDED.radio_m, actualizado_en=now()' : 'NOTHING'}`,
      [g.nombre, g.tipo, g.cliente || '', g.lat, g.lng, g.radioM || 200]
    );
  }
  console.log(`✔ ${geos.length} geocercas`);

  // Rutas y paradas
  let sinCoords = 0;
  for (const r of flota.rutas) {
    const unidad = r.unidad ? String(r.unidad).toUpperCase() : null;
    const res = await pool.query(
      `INSERT INTO rutas (nombre, cliente, sentido, hora, duracion_min, unidad, dias)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (cliente, sentido, hora, nombre) DO ${SOBRE ? 'UPDATE SET duracion_min=EXCLUDED.duracion_min, unidad=EXCLUDED.unidad, dias=EXCLUDED.dias' : 'NOTHING'}
       RETURNING id`,
      [r.nombre, r.cliente, r.sentido, r.hora, r.duracionMin || 45, unidad, r.dias || '1,2,3,4,5,6']
    );
    const rutaId = res.rows[0]?.id;
    if (!rutaId) continue; // ya existía y no se sobrescribe
    await pool.query('DELETE FROM paradas WHERE ruta_id = $1 AND NOT EXISTS (SELECT 1 FROM viaje_paradas vp WHERE vp.parada_id = paradas.id)', [rutaId]);
    for (let i = 0; i < (r.paradas || []).length; i++) {
      const p = r.paradas[i];
      if (p.lat == null) sinCoords++;
      await pool.query(
        `INSERT INTO paradas (ruta_id, orden, nombre, lat, lng, min_desde_inicio) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (ruta_id, orden) DO UPDATE SET nombre=EXCLUDED.nombre, lat=EXCLUDED.lat, lng=EXCLUDED.lng, min_desde_inicio=EXCLUDED.min_desde_inicio`,
        [rutaId, i, p.nombre, p.lat, p.lng, p.minDesdeInicio || 0]
      );
    }
  }
  if (sinCoords) avisos.push(`${sinCoords} paradas sin coordenadas (el seguimiento automático las necesita)`);
  console.log(`✔ ${flota.rutas.length} rutas`);

  if (avisos.length) {
    console.log('\n⚠ Falta rellenar en config/flota.js (o desde el sistema):');
    for (const a of avisos) console.log('  - ' + a);
  }
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error('✖ Error en seed:', err.message);
    pool.end();
    process.exit(1);
  });

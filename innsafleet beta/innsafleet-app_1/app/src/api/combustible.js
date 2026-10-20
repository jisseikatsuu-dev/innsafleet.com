// Pantalla "Combustible" — rendimiento km/L por unidad contra su meta
const express = require('express');
const samsara = require('../samsara');
const { syncReporte } = require('../sincronizacion');
const { pool, v, h, soloAdmin, auditar, ErrorValidacion, leerReglas, c, unidadParam, clienteParam } = require('./comun');

const router = express.Router();

function semanaISO(fechaStr) {
  const d = new Date(fechaStr + 'T12:00:00Z');
  const dia = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dia + 3);
  const primerJueves = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d - primerJueves) / 86400000 - 3 + ((primerJueves.getUTCDay() + 6) % 7)) / 7);
}
function lunesDe(fechaStr) {
  const d = new Date(fechaStr + 'T12:00:00Z');
  return c.sumarDias(fechaStr, -((d.getUTCDay() + 6) % 7));
}

async function datosRendimiento(q) {
  const hoy = c.hoyLocal();
  const { desde, hasta } = v.rango(q.desde || hoy.slice(0, 8) + '01', q.hasta || hoy, 400);
  const cliente = clienteParam(q.cliente);
  const reglas = await leerReglas(pool);

  const lunesHoy = lunesDe(hasta);
  const semanas = Array.from({ length: 8 }, (_, i) => c.sumarDias(lunesHoy, -7 * (7 - i)));

  const [unidades, periodo, porSemana, cargas, excesos, rutas] = await Promise.all([
    pool.query(`SELECT unidad, tipo, capacidad, cliente, meta_kml::float, samsara_id FROM unidades
                WHERE activo AND estado <> 'baja' AND ($1 = '' OR cliente = $1) ORDER BY unidad`, [cliente]),
    pool.query(`SELECT unidad, SUM(distancia_km)::float km, SUM(litros)::float l, SUM(horas_motor)::float hm, SUM(horas_ralenti)::float hr
                FROM rendimiento_diario WHERE fecha BETWEEN $1 AND $2 AND unidad IS NOT NULL GROUP BY unidad`, [desde, hasta]),
    pool.query(`SELECT unidad, date_trunc('week', fecha)::date::text AS semana, SUM(distancia_km)::float km, SUM(litros)::float l
                FROM rendimiento_diario WHERE fecha >= $1 AND fecha <= $2 AND unidad IS NOT NULL GROUP BY 1, 2`, [semanas[0], c.sumarDias(lunesHoy, 6)]),
    pool.query(`SELECT unidad, COUNT(*)::int n, SUM(litros)::float l, SUM(litros * COALESCE(precio_litro, $3))::float costo
                FROM cargas WHERE fecha_hora >= $1 AND fecha_hora < $2 GROUP BY unidad`,
               [c.inicioDiaLocal(desde), c.inicioDiaLocal(c.sumarDias(hasta, 1)), reglas.precioDieselLitro]),
    pool.query(`SELECT unidad, COUNT(*)::int n FROM excesos_velocidad WHERE tiempo >= $1 AND tiempo < $2 GROUP BY unidad`,
               [c.inicioDiaLocal(desde), c.inicioDiaLocal(c.sumarDias(hasta, 1))]),
    pool.query(`SELECT DISTINCT ON (unidad) unidad, nombre, sentido, to_char(hora, 'HH24:MI') hora FROM rutas WHERE activo AND unidad IS NOT NULL ORDER BY unidad, hora`),
  ]);

  const P = new Map(periodo.rows.map((r) => [r.unidad, r]));
  const S = new Map(porSemana.rows.map((r) => [`${r.unidad}|${r.semana}`, r]));
  const C = new Map(cargas.rows.map((r) => [r.unidad, r]));
  const E = new Map(excesos.rows.map((r) => [r.unidad, r.n]));
  const R = new Map(rutas.rows.map((r) => [r.unidad, r]));

  const filas = unidades.rows.map((u) => {
    const p = P.get(u.unidad);
    const km = p?.km || 0;
    const l = p?.l || 0;
    const kml = l > 0 ? km / l : null;
    const meta = u.meta_kml || null;
    const ruta = R.get(u.unidad);
    const carga = C.get(u.unidad);
    return {
      id: u.unidad,
      type: `${u.tipo}${u.capacidad ? ` ${u.capacidad} pas.` : ''}`,
      client: u.cliente,
      route: ruta ? `${ruta.nombre} · ${ruta.sentido.toLowerCase()} ${ruta.hora}` : 'Sin ruta asignada',
      vinculada: Boolean(u.samsara_id),
      km, l, kml, meta,
      ratio: kml != null && meta ? kml / meta : null,
      idle: p && p.hm > 0 ? Math.round((p.hr / p.hm) * 100) : null,
      speed: E.get(u.unidad) || 0,
      loads: carga?.n || 0,
      litrosCargados: carga?.l || 0,
      cost: carga?.costo || (l * reglas.precioDieselLitro) || 0,
      w: semanas.map((s) => {
        const x = S.get(`${u.unidad}|${s}`);
        return x && x.l > 0 ? +(x.km / x.l).toFixed(2) : null;
      }),
    };
  });

  let kmT = 0, lT = 0, costT = 0;
  for (const f of filas) { kmT += f.km; lT += f.l; costT += f.cost; }
  return {
    desde, hasta, cliente,
    precio: reglas.precioDieselLitro,
    ralentiAlerta: reglas.ralentiAlertaPct,
    semanas: semanas.map((s) => 'S' + semanaISO(s)),
    kpi: {
      kmL: lT > 0 ? kmT / lT : null,
      liters: lT,
      km: kmT,
      cost: costT,
      costKm: kmT > 0 && costT > 0 ? costT / kmT : null,
      under: filas.filter((f) => f.ratio != null && f.ratio < 1).length,
      units: filas.length,
    },
    unidades: filas,
  };
}

router.get('/combustible', h(async (req, res) => res.json(await datosRendimiento(req.query))));

router.get('/combustible/exportar.csv', h(async (req, res) => {
  const d = await datosRendimiento(req.query);
  const esc = (s) => `"${String(s ?? '').replace(/"/g, '""').replace(/^[=+\-@]/, "'$&")}"`;
  const lineas = [['Unidad', 'Tipo', 'Cliente', 'Km', 'Litros', 'km/L', 'Meta', 'Desviación %', 'Ralentí %', 'Excesos', 'Cargas', 'Costo'].join(',')];
  for (const u of d.unidades) {
    lineas.push([u.id, u.type, u.client, u.km.toFixed(0), u.l.toFixed(0), u.kml?.toFixed(2) ?? '', u.meta ?? '',
      u.ratio != null ? ((u.ratio - 1) * 100).toFixed(1) : '', u.idle ?? '', u.speed, u.loads, u.cost.toFixed(0)].map(esc).join(','));
  }
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="rendimiento_${d.desde}_${d.hasta}.csv"`);
  res.send('\uFEFF' + lineas.join('\n'));
}));

// ---------------------------------------------------------------------
// Cargas de combustible
// ---------------------------------------------------------------------
router.get('/cargas', h(async (req, res) => {
  const unidad = unidadParam(req.query.unidad);
  const r = await pool.query(
    `SELECT id, fecha_hora, litros::float, odometro_km::float, precio_litro::float, tanque_lleno, estacion, capturado_por
     FROM cargas WHERE unidad = $1 ORDER BY fecha_hora DESC LIMIT 100`, [unidad]);
  res.json(r.rows);
}));

router.post('/cargas', soloAdmin, h(async (req, res) => {
  const b = req.body || {};
  const unidad = unidadParam(b.unidad);
  const fechaHora = v.fechaHora(b.fechaHora, 'Fecha y hora', { requerido: true });
  const litros = v.numero(b.litros, 'Litros', { requerido: true, min: 0.1, max: 2000 });
  const odometro = v.numero(b.odometroKm, 'Odómetro', { min: 0, max: 5000000 });
  const reglas = await leerReglas(pool);
  const precio = v.numero(b.precioLitro, 'Precio por litro', { min: 0, max: 500 }) ?? (reglas.precioDieselLitro || null);
  const lleno = b.tanqueLleno === undefined ? true : v.booleano(b.tanqueLleno);
  const estacion = v.texto(b.estacion, 'Estación', { max: 80 });

  if (!(await pool.query('SELECT 1 FROM unidades WHERE unidad=$1', [unidad])).rows.length) {
    throw new ErrorValidacion(`La unidad ${unidad} no existe.`);
  }
  if (odometro != null) {
    const prev = await pool.query('SELECT odometro_km::float o FROM cargas WHERE unidad=$1 AND fecha_hora < $2 AND odometro_km IS NOT NULL ORDER BY fecha_hora DESC LIMIT 1', [unidad, fechaHora]);
    if (prev.rows.length && odometro < prev.rows[0].o) {
      throw new ErrorValidacion(`El odómetro (${odometro}) es menor que el de la carga anterior (${prev.rows[0].o}).`);
    }
  }
  const r = await pool.query(
    `INSERT INTO cargas (unidad, fecha_hora, litros, odometro_km, precio_litro, tanque_lleno, estacion, capturado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [unidad, fechaHora, litros, odometro, precio, lleno, estacion, req.session.usuario]);
  await auditar(pool, req, 'carga.crear', { unidad, litros, odometro });
  res.status(201).json({ id: r.rows[0].id });
}));

router.delete('/cargas/:id', soloAdmin, h(async (req, res) => {
  const id = v.entero(req.params.id, 'id', { requerido: true, min: 1 });
  const r = await pool.query('DELETE FROM cargas WHERE id=$1 RETURNING unidad, litros', [id]);
  if (!r.rows.length) return res.status(404).json({ error: 'Carga no encontrada.' });
  await auditar(pool, req, 'carga.eliminar', { id, ...r.rows[0] });
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------
// Samsara: vincular unidades y traer el reporte de combustible
// ---------------------------------------------------------------------
router.post('/samsara/sync-vehiculos', soloAdmin, h(async (req, res) => {
  const r = await samsara.syncVehiculos(pool);
  await auditar(pool, req, 'samsara.sync_vehiculos', r);
  res.json(r);
}));

let syncEnCurso = false;
router.post('/samsara/sync-reporte', soloAdmin, h(async (req, res) => {
  const { desde, hasta } = v.rango(req.body?.desde, req.body?.hasta, 31);
  if (syncEnCurso) return res.status(409).json({ error: 'Ya hay una sincronización corriendo.' });
  syncEnCurso = true;
  try {
    const r = await syncReporte(pool, desde, hasta);
    await auditar(pool, req, 'samsara.sync_reporte', { desde, hasta, ...r });
    res.json(r);
  } finally {
    syncEnCurso = false;
  }
}));

module.exports = router;

// Pantalla "Rutas" (Recorrido) — viajes del día, seguimiento, paradas, vías alternas y geocercas
const express = require('express');
const samsara = require('../samsara');
const monitor = require('../monitor');
const { generarViajes, retardo } = require('../viajes');
const { pool, v, h, soloAdmin, auditar, ErrorValidacion, leerReglas, c, unidadParam, fechaParam } = require('./comun');

const router = express.Router();

const SQL_VIAJE = `
  SELECT v.*, r.nombre ruta_nombre, r.cliente, r.sentido, r.duracion_min, to_char(r.hora,'HH24:MI') hora_ruta,
         ch.nombre chofer, u.capacidad
  FROM viajes v JOIN rutas r ON r.id = v.ruta_id
  LEFT JOIN choferes ch ON ch.id = v.chofer_id
  LEFT JOIN unidades u ON u.unidad = v.unidad`;

function estadoTexto(x, tol) {
  if (x.estado === 'cancelado') return 'Cancelado';
  if (x.estado === 'terminado') return 'Terminado';
  if (x.estado === 'por_iniciar') return 'Por iniciar';
  return retardo(x) > tol ? 'Con retraso' : 'En ruta';
}

router.get('/viajes', h(async (req, res) => {
  const fecha = fechaParam(req.query.fecha);
  const reglas = await leerReglas(pool);
  if (fecha >= c.hoyLocal()) await generarViajes(pool, fecha);
  const r = await pool.query(`${SQL_VIAJE} WHERE v.fecha = $1 ORDER BY v.salida_prog, r.cliente, r.nombre`, [fecha]);
  res.json({
    fecha,
    tolerancia: reglas.toleranciaRetardoMin,
    viajes: r.rows.map((x) => ({
      id: x.id, name: x.ruta_nombre, client: x.cliente, sentido: x.sentido, unit: x.unidad || '—', driver: x.chofer || 'Sin chofer',
      estado: x.estado, state: estadoTexto(x, reglas.toleranciaRetardoMin), delay: retardo(x),
      dep: c.horaLocal(x.salida_prog), arr: c.horaLocal(x.llegada_prog),
    })),
  });
}));

router.get('/viajes/:id', h(async (req, res) => {
  const id = v.entero(req.params.id, 'id', { requerido: true, min: 1 });
  const reglas = await leerReglas(pool);
  const r = await pool.query(`${SQL_VIAJE} WHERE v.id = $1`, [id]);
  const x = r.rows[0];
  if (!x) return res.status(404).json({ error: 'Viaje no encontrado.' });

  const [paradas, planta, alt, prom] = await Promise.all([
    pool.query(`SELECT vp.*, p.orden, p.nombre, p.lat, p.lng FROM viaje_paradas vp JOIN paradas p ON p.id = vp.parada_id
                WHERE vp.viaje_id=$1 ORDER BY p.orden`, [id]),
    pool.query("SELECT nombre, lat, lng, radio_m FROM geocercas WHERE tipo='PLANTA' AND cliente=$1 AND activo LIMIT 1", [x.cliente]),
    pool.query("SELECT * FROM vias_alternas WHERE viaje_id=$1 AND estado <> 'descartada' ORDER BY creado_en DESC LIMIT 1", [id]),
    pool.query(`SELECT AVG(EXTRACT(EPOCH FROM (llegada_real - salida_real)) / 60)::float m FROM (
                  SELECT llegada_real, salida_real FROM viajes WHERE ruta_id=$1 AND estado='terminado'
                  AND salida_real IS NOT NULL AND llegada_real IS NOT NULL AND id <> $2 ORDER BY fecha DESC LIMIT 10) t`, [x.ruta_id, id]),
  ]);

  const pl = planta.rows[0] || null;
  const gps = x.ultimo_gps || null;
  const delay = retardo(x);
  const prog = x.duracion_min;
  const fin = x.llegada_real || x.eta;
  const est = x.salida_real && fin ? c.minutosEntre(x.salida_real, fin) : prog;
  const a = alt.rows[0];

  res.json({
    id: x.id,
    name: x.ruta_nombre, unit: x.unidad, driver: x.chofer || 'Sin chofer', client: x.cliente, sentido: x.sentido,
    choferId: x.chofer_id, usuarios: x.usuarios, capacidad: x.capacidad,
    plantName: pl?.nombre || `Planta ${x.cliente}`,
    plant: pl && pl.lat != null ? { lat: pl.lat, lng: pl.lng, radio: pl.radio_m } : null,
    dep: c.horaLocal(x.salida_prog), depReal: c.horaLocal(x.salida_real) || '—',
    arr: c.horaLocal(x.llegada_prog), arrReal: c.horaLocal(x.llegada_real),
    eta: c.horaLocal(x.llegada_real || x.eta || x.llegada_prog),
    delay, tolerancia: reglas.toleranciaRetardoMin,
    estado: x.estado, state: estadoTexto(x, reglas.toleranciaRetardoMin),
    kmDone: x.km != null ? Number(x.km) : 0,
    speed: gps?.kmh != null ? Math.round(gps.kmh) : 0,
    gpsTiempo: gps?.tiempo || null,
    cur: gps && gps.lat != null ? { lat: gps.lat, lng: gps.lng } : null,
    bars: { prog, est, avg: prom.rows[0]?.m ? Math.round(prom.rows[0].m) : null },
    stops: paradas.rows.map((p) => ({
      paradaId: p.parada_id, n: p.orden + 1, name: p.nombre, lat: p.lat, lng: p.lng,
      prog: c.horaLocal(p.hora_prog), real: c.horaLocal(p.hora_real),
      riders: p.usuarios, st: p.estado, why: p.motivo,
    })),
    alt: a ? { id: a.id, via: a.via, reason: a.motivo, save: a.ahorro_min, km: a.km_extra != null ? Number(a.km_extra) : null, path: a.puntos, estado: a.estado,
               eta: a.ahorro_min != null ? c.horaLocal(new Date(new Date(x.llegada_real || x.eta || x.llegada_prog).getTime() - a.ahorro_min * 60000)) : null } : null,
  });
}));

// --- Correcciones manuales del despachador ---
function horaDeFecha(fecha, hhmm, campo) {
  if (!hhmm) return null;
  if (!/^\d{2}:\d{2}$/.test(hhmm)) throw new ErrorValidacion(`${campo} debe ser HH:MM.`);
  return c.fechaHoraLocal(fecha, hhmm);
}

router.put('/viajes/:id', soloAdmin, h(async (req, res) => {
  const id = v.entero(req.params.id, 'id', { requerido: true, min: 1 });
  const b = req.body || {};
  const x = (await pool.query('SELECT fecha::text f FROM viajes WHERE id=$1', [id])).rows[0];
  if (!x) return res.status(404).json({ error: 'Viaje no encontrado.' });
  const unidad = b.unidad ? unidadParam(b.unidad) : null;
  const choferId = v.entero(b.choferId, 'Chofer', { min: 1 });
  const usuarios = v.entero(b.usuarios, 'Usuarios', { min: 0, max: 120 });
  const estado = b.estado ? v.enLista(b.estado, 'Estado', ['por_iniciar', 'en_ruta', 'terminado', 'cancelado']) : null;
  const sal = horaDeFecha(x.f, b.salidaReal, 'Salida real');
  const lleg = horaDeFecha(x.f, b.llegadaReal, 'Llegada real');
  await pool.query(
    `UPDATE viajes SET unidad=COALESCE($2, unidad), chofer_id=COALESCE($3, chofer_id), usuarios=COALESCE($4, usuarios),
       estado=COALESCE($5, estado), salida_real=COALESCE($6, salida_real), llegada_real=COALESCE($7, llegada_real) WHERE id=$1`,
    [id, unidad, choferId, usuarios, estado, sal, lleg]);
  await auditar(pool, req, 'viaje.editar', { id, ...b });
  res.json({ ok: true });
}));

router.put('/viajes/:id/paradas/:pid', soloAdmin, h(async (req, res) => {
  const id = v.entero(req.params.id, 'id', { requerido: true, min: 1 });
  const pid = v.entero(req.params.pid, 'parada', { requerido: true, min: 1 });
  const b = req.body || {};
  const x = (await pool.query('SELECT fecha::text f FROM viajes WHERE id=$1', [id])).rows[0];
  if (!x) return res.status(404).json({ error: 'Viaje no encontrado.' });
  const estado = v.enLista(b.estado || 'ok', 'Estado', ['pendiente', 'ok', 'omitida']);
  const hora = horaDeFecha(x.f, b.horaReal, 'Hora real');
  const usuarios = v.entero(b.usuarios, 'Usuarios', { min: 0, max: 120 });
  const motivo = v.texto(b.motivo, 'Motivo', { max: 120 });
  const r = await pool.query(
    'UPDATE viaje_paradas SET estado=$3, hora_real=$4, usuarios=$5, motivo=$6 WHERE viaje_id=$1 AND parada_id=$2 RETURNING 1',
    [id, pid, estado, estado === 'ok' ? hora || new Date() : null, usuarios, estado === 'omitida' ? motivo || 'Registrado por despacho' : '']);
  if (!r.rows.length) return res.status(404).json({ error: 'Parada no encontrada.' });
  // Usuarios del viaje = suma de las paradas
  await pool.query('UPDATE viajes SET usuarios = (SELECT COALESCE(SUM(usuarios),0) FROM viaje_paradas WHERE viaje_id=$1) WHERE id=$1', [id]);
  await auditar(pool, req, 'viaje.parada', { id, pid, estado, usuarios });
  res.json({ ok: true });
}));

// --- Vías alternas ---
router.post('/viajes/:id/alternas', soloAdmin, h(async (req, res) => {
  const id = v.entero(req.params.id, 'id', { requerido: true, min: 1 });
  const b = req.body || {};
  const via = v.texto(b.via, 'Vía', { requerido: true, max: 80 });
  const motivo = v.texto(b.motivo, 'Motivo', { max: 160 });
  const ahorro = v.entero(b.ahorroMin, 'Ahorro', { min: -120, max: 120 });
  const km = v.numero(b.kmExtra, 'Km extra', { min: -100, max: 100 });
  const puntos = Array.isArray(b.puntos) ? b.puntos.slice(0, 200).map((p, i) => [
    v.numero(p?.[0], `Punto ${i + 1} latitud`, { requerido: true, min: -90, max: 90 }),
    v.numero(p?.[1], `Punto ${i + 1} longitud`, { requerido: true, min: -180, max: 180 }),
  ]) : [];
  await pool.query("UPDATE vias_alternas SET estado='descartada' WHERE viaje_id=$1 AND estado='sugerida'", [id]);
  const r = await pool.query(
    'INSERT INTO vias_alternas (viaje_id, via, motivo, ahorro_min, km_extra, puntos, creado_por) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
    [id, via, motivo, ahorro, km, JSON.stringify(puntos), req.session.usuario]);
  await auditar(pool, req, 'alterna.crear', { id, via });
  res.status(201).json({ id: r.rows[0].id });
}));

router.post('/alternas/:id/:accion', soloAdmin, h(async (req, res) => {
  const id = v.entero(req.params.id, 'id', { requerido: true, min: 1 });
  const accion = v.enLista(req.params.accion, 'Acción', ['enviar', 'descartar']);
  // ▶ Aquí se conecta el envío real al chofer (p. ej. tu bot de WhatsApp) cuando lo tengas listo.
  const r = await pool.query('UPDATE vias_alternas SET estado=$2 WHERE id=$1 RETURNING viaje_id', [id, accion === 'enviar' ? 'enviada' : 'descartada']);
  if (!r.rows.length) return res.status(404).json({ error: 'Vía alterna no encontrada.' });
  await auditar(pool, req, `alterna.${accion}`, { id });
  res.json({ ok: true });
}));

// --- Catálogo de rutas y paradas ---
router.get('/rutas', h(async (req, res) => {
  const r = await pool.query(
    `SELECT r.id, r.nombre, r.cliente, r.sentido, to_char(r.hora,'HH24:MI') hora, r.duracion_min, r.unidad, r.chofer_id, r.dias, r.activo,
       COALESCE(json_agg(json_build_object('orden', p.orden, 'nombre', p.nombre, 'lat', p.lat, 'lng', p.lng, 'min', p.min_desde_inicio) ORDER BY p.orden)
         FILTER (WHERE p.id IS NOT NULL), '[]') paradas
     FROM rutas r LEFT JOIN paradas p ON p.ruta_id = r.id GROUP BY r.id ORDER BY r.cliente, r.sentido, r.hora, r.nombre`);
  res.json(r.rows);
}));

router.put('/rutas/:id', soloAdmin, h(async (req, res) => {
  const id = v.entero(req.params.id, 'id', { requerido: true, min: 1 });
  const b = req.body || {};
  const hora = v.texto(b.hora, 'Hora', { requerido: true, patron: /^\d{2}:\d{2}$/ });
  const dur = v.entero(b.duracionMin, 'Duración', { requerido: true, min: 5, max: 300 });
  const unidad = b.unidad ? unidadParam(b.unidad) : null;
  const chofer = v.entero(b.choferId, 'Chofer', { min: 1 });
  const dias = v.texto(b.dias, 'Días', { max: 13, patron: /^[0-6](,[0-6])*$/ }) || '1,2,3,4,5,6';
  const activo = b.activo === undefined ? true : v.booleano(b.activo);
  const paradas = Array.isArray(b.paradas) ? b.paradas.slice(0, 40).map((p, i) => ({
    nombre: v.texto(p.nombre, `Parada ${i + 1}`, { requerido: true, max: 80 }),
    lat: v.numero(p.lat, `Latitud parada ${i + 1}`, { min: -90, max: 90 }),
    lng: v.numero(p.lng, `Longitud parada ${i + 1}`, { min: -180, max: 180 }),
    min: v.entero(p.min, `Minuto parada ${i + 1}`, { min: 0, max: 300 }) ?? 0,
  })) : null;

  const cli = await pool.connect();
  try {
    await cli.query('BEGIN');
    const r = await cli.query('UPDATE rutas SET hora=$2, duracion_min=$3, unidad=$4, chofer_id=$5, dias=$6, activo=$7 WHERE id=$1 RETURNING id', [id, hora, dur, unidad, chofer, dias, activo]);
    if (!r.rows.length) { await cli.query('ROLLBACK'); return res.status(404).json({ error: 'Ruta no encontrada.' }); }
    if (paradas) {
      for (let i = 0; i < paradas.length; i++) {
        const p = paradas[i];
        await cli.query(
          `INSERT INTO paradas (ruta_id, orden, nombre, lat, lng, min_desde_inicio) VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (ruta_id, orden) DO UPDATE SET nombre=EXCLUDED.nombre, lat=EXCLUDED.lat, lng=EXCLUDED.lng, min_desde_inicio=EXCLUDED.min_desde_inicio`,
          [id, i, p.nombre, p.lat, p.lng, p.min]);
      }
      await cli.query('DELETE FROM paradas WHERE ruta_id=$1 AND orden >= $2', [id, paradas.length]);
    }
    // Rehace los viajes que aún no salen (hoy y mañana) con la ruta actualizada
    await cli.query("DELETE FROM viajes WHERE ruta_id=$1 AND estado='por_iniciar' AND fecha >= $2", [id, c.hoyLocal()]);
    await cli.query('COMMIT');
  } catch (e) {
    await cli.query('ROLLBACK');
    throw e;
  } finally {
    cli.release();
  }
  await generarViajes(pool, c.hoyLocal());
  await generarViajes(pool, c.sumarDias(c.hoyLocal(), 1));
  await auditar(pool, req, 'ruta.editar', { id, hora, dur, unidad, paradas: paradas?.length });
  res.json({ ok: true });
}));

// --- En vivo (para mapas) ---
router.get('/en-vivo', h(async (req, res) => {
  const lista = [];
  for (const [unidad, s] of monitor.vivo.porUnidad) {
    lista.push({ unidad, gps: s.gps, combustiblePct: s.combustiblePct?.valor ?? null, motor: s.motor?.valor ?? null, odometroKm: s.odometroKm?.valor ?? null });
  }
  res.json({ samsara: samsara.hayToken(), actualizado: monitor.vivo.actualizado, error: monitor.vivo.error ? 'Samsara no respondió en la última lectura.' : null, unidades: lista });
}));

// --- Geocercas ---
const TIPOS_GEO = ['PLANTA', 'PATIO', 'GASOLINERA', 'TALLER', 'OTRO'];
function leerGeo(b) {
  return {
    nombre: v.texto(b.nombre, 'Nombre', { requerido: true, max: 80 }),
    tipo: v.enLista(String(b.tipo || 'OTRO').toUpperCase(), 'Tipo', TIPOS_GEO),
    cliente: v.texto(b.cliente, 'Cliente', { max: 40 }).toUpperCase(),
    lat: v.numero(b.lat, 'Latitud', { requerido: true, min: -90, max: 90 }),
    lng: v.numero(b.lng, 'Longitud', { requerido: true, min: -180, max: 180 }),
    radioM: v.entero(b.radioM, 'Radio', { requerido: true, min: 10, max: 20000 }),
  };
}

router.get('/geocercas', h(async (req, res) => {
  const r = await pool.query('SELECT id, samsara_id, nombre, tipo, cliente, lat, lng, radio_m, activo FROM geocercas ORDER BY tipo, nombre');
  res.json(r.rows);
}));

router.post('/geocercas', soloAdmin, h(async (req, res) => {
  const g = leerGeo(req.body || {});
  let sid = null;
  if (v.booleano(req.body?.enviarSamsara)) sid = (await samsara.crearGeocerca(g)).samsaraId;
  const r = await pool.query(
    'INSERT INTO geocercas (nombre, tipo, cliente, lat, lng, radio_m, samsara_id) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (nombre) DO NOTHING RETURNING id',
    [g.nombre, g.tipo, g.cliente, g.lat, g.lng, g.radioM, sid]);
  if (!r.rows.length) return res.status(409).json({ error: `Ya existe "${g.nombre}".` });
  await auditar(pool, req, 'geocerca.crear', { ...g, sid });
  res.status(201).json({ id: r.rows[0].id });
}));

router.put('/geocercas/:id', soloAdmin, h(async (req, res) => {
  const id = v.entero(req.params.id, 'id', { requerido: true, min: 1 });
  const g = leerGeo(req.body || {});
  const r = await pool.query(
    'UPDATE geocercas SET nombre=$2, tipo=$3, cliente=$4, lat=$5, lng=$6, radio_m=$7, actualizado_en=now() WHERE id=$1 RETURNING samsara_id',
    [id, g.nombre, g.tipo, g.cliente, g.lat, g.lng, g.radioM]);
  if (!r.rows.length) return res.status(404).json({ error: 'Geocerca no encontrada.' });
  if (r.rows[0].samsara_id && samsara.hayToken()) await samsara.actualizarGeocerca(r.rows[0].samsara_id, g);
  await auditar(pool, req, 'geocerca.editar', { id, ...g });
  res.json({ ok: true });
}));

router.delete('/geocercas/:id', soloAdmin, h(async (req, res) => {
  const id = v.entero(req.params.id, 'id', { requerido: true, min: 1 });
  const g = (await pool.query('SELECT * FROM geocercas WHERE id=$1', [id])).rows[0];
  if (!g) return res.status(404).json({ error: 'Geocerca no encontrada.' });
  if (req.query.tambienSamsara === '1' && g.samsara_id) await samsara.eliminarGeocerca(g.samsara_id);
  await pool.query('DELETE FROM geocercas WHERE id=$1', [id]);
  await auditar(pool, req, 'geocerca.eliminar', { id, nombre: g.nombre });
  res.json({ ok: true });
}));

router.post('/geocercas/:id/samsara', soloAdmin, h(async (req, res) => {
  const id = v.entero(req.params.id, 'id', { requerido: true, min: 1 });
  const g = (await pool.query('SELECT * FROM geocercas WHERE id=$1', [id])).rows[0];
  if (!g) return res.status(404).json({ error: 'Geocerca no encontrada.' });
  if (g.samsara_id) return res.status(409).json({ error: 'Ya está en Samsara.' });
  if (g.lat == null) throw new ErrorValidacion('Primero captura las coordenadas.');
  const { samsaraId } = await samsara.crearGeocerca({ nombre: g.nombre, lat: g.lat, lng: g.lng, radioM: g.radio_m });
  await pool.query('UPDATE geocercas SET samsara_id=$2 WHERE id=$1', [id, samsaraId]);
  await auditar(pool, req, 'geocerca.enviar_samsara', { id, samsaraId });
  res.json({ ok: true });
}));

router.post('/geocercas/importar', soloAdmin, h(async (req, res) => {
  const lista = await samsara.listarGeocercas();
  let importadas = 0, omitidas = 0;
  for (const g of lista) {
    if (g.esPoligono || g.lat == null || g.radioM == null) { omitidas++; continue; }
    const choca = (await pool.query('SELECT samsara_id FROM geocercas WHERE nombre=$1', [g.nombre])).rows[0];
    const nombre = choca && choca.samsara_id !== g.samsaraId ? `${g.nombre} (Samsara)`.slice(0, 80) : String(g.nombre).slice(0, 80);
    await pool.query(
      `INSERT INTO geocercas (samsara_id, nombre, lat, lng, radio_m) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (samsara_id) DO UPDATE SET lat=EXCLUDED.lat, lng=EXCLUDED.lng, radio_m=EXCLUDED.radio_m, actualizado_en=now()`,
      [g.samsaraId, nombre, g.lat, g.lng, Math.max(10, Math.round(g.radioM))]);
    importadas++;
  }
  await auditar(pool, req, 'geocerca.importar', { importadas, omitidas });
  res.json({ importadas, omitidas });
}));

module.exports = router;

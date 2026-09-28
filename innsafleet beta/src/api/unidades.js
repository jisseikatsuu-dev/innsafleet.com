// Pantalla "Unidades" — lista, ficha, alta y edición; catálogo de choferes
const express = require('express');
const { pool, v, h, soloAdmin, auditar, ErrorValidacion, leerReglas, c, unidadParam, estadosDelDia, estadoVisible } = require('./comun');
const { PATRON_UNIDAD } = require('../seguridad');

const router = express.Router();

async function listaUnidades() {
  const hoy = c.hoyLocal();
  const reglas = await leerReglas(pool);
  const [u, estados, rutasHoy, rend, notas] = await Promise.all([
    pool.query(`SELECT u.*, u.meta_kml::float meta, u.odometro_km::float odo, u.prox_servicio_km::float prox, ch.nombre chofer
                FROM unidades u LEFT JOIN choferes ch ON ch.id = u.chofer_id WHERE u.activo ORDER BY u.unidad`),
    estadosDelDia(hoy),
    pool.query(`SELECT DISTINCT ON (v.unidad) v.unidad, r.nombre, r.cliente, r.sentido, to_char(r.hora,'HH24:MI') hora, ch.nombre chofer
                FROM viajes v JOIN rutas r ON r.id = v.ruta_id LEFT JOIN choferes ch ON ch.id = v.chofer_id
                WHERE v.fecha = $1 AND v.unidad IS NOT NULL
                ORDER BY v.unidad, (v.estado = 'en_ruta') DESC, (v.estado = 'por_iniciar') DESC, v.salida_prog`, [hoy]),
    pool.query(`SELECT unidad, SUM(distancia_km)::float km, SUM(litros)::float l FROM rendimiento_diario
                WHERE fecha >= $1 AND unidad IS NOT NULL GROUP BY unidad`, [c.sumarDias(hoy, -29)]),
    pool.query(`SELECT unidad, motivo, taller, salida_estimada, ingreso FROM taller WHERE estado <> 'Cerrado'
                UNION ALL SELECT unidad, titulo, nivel, NULL, fecha FROM danos_graves WHERE NOT cerrado`),
  ]);
  const RH = new Map(rutasHoy.rows.map((r) => [r.unidad, r]));
  const RD = new Map(rend.rows.map((r) => [r.unidad, r]));
  const N = new Map(notas.rows.map((r) => [r.unidad, r]));

  return u.rows.map((x) => {
    const st = estadoVisible(x, estados.get(x.unidad));
    const ruta = RH.get(x.unidad);
    const rd = RD.get(x.unidad);
    const prox = x.prox ?? (x.odo != null ? Math.ceil((x.odo + 1) / reglas.intervaloServicioKm) * reglas.intervaloServicioKm : null);
    const n = N.get(x.unidad);
    let nota = x.nota || '';
    if (!nota && n && st === 'taller') nota = `En taller: ${n.motivo.toLowerCase()}${n.salida_estimada ? ' · salida estimada ' + c.fechaLocal(n.salida_estimada) : ''}`;
    if (!nota && n && st === 'baja') nota = `Daño ${String(n.taller).toLowerCase()}: ${n.motivo.toLowerCase()}`;
    return {
      id: x.unidad, type: x.tipo, year: x.anio, cap: x.capacidad, plates: x.placas, client: x.cliente,
      st,
      route: ruta ? `${ruta.nombre} · ${ruta.sentido === 'ENTRADA' ? 'entrada' : 'salida'} ${ruta.hora}` : (st === 'patio' ? 'Reserva' : 'Sin ruta hoy'),
      driver: ruta?.chofer || x.chofer || 'Sin asignar',
      choferId: x.chofer_id,
      odo: x.odo, next: prox, interval: reglas.intervaloServicioKm,
      kml: rd && rd.l > 0 ? rd.km / rd.l : null, meta: x.meta,
      poliza: x.poliza_vence ? c.fechaLocal(x.poliza_vence) : null, polizaNota: x.poliza_nota,
      tarjeta: x.tarjeta_circulacion, verificacion: x.verificacion,
      note: nota, samsara: Boolean(x.samsara_id), tanque: x.tanque_litros, psi: x.psi_objetivo, estadoBase: x.estado,
    };
  });
}

router.get('/unidades', h(async (req, res) => {
  const reglas = await leerReglas(pool);
  res.json({ unidades: await listaUnidades(), diasAviso: reglas.diasAvisoDocumentos, hoy: c.hoyLocal() });
}));

// Ficha: checklist de hoy y neumáticos
router.get('/unidades/:unidad/hoy', h(async (req, res) => {
  const unidad = unidadParam(req.params.unidad);
  const reglas = await leerReglas(pool);
  const [cl, ne, u] = await Promise.all([
    pool.query('SELECT veredicto, estado FROM checklists WHERE unidad=$1 AND fecha=$2', [unidad, c.hoyLocal()]),
    pool.query('SELECT mm::float, psi FROM neumaticos WHERE unidad=$1', [unidad]),
    pool.query('SELECT psi_objetivo, estado FROM unidades WHERE unidad=$1', [unidad]),
  ]);
  const VER = { apta: 'Apta', observaciones: 'Con observaciones', no_apta: 'No apta', pendiente: 'En captura' };
  let checklist = cl.rows[0] ? VER[cl.rows[0].veredicto] : 'Pendiente';
  if (u.rows[0]?.estado !== 'operando') checklist = 'No aplica';
  let tires = 'Sin revisión';
  if (ne.rows.length) {
    const obj = u.rows[0]?.psi_objetivo;
    const cambiar = ne.rows.filter((t) => t.mm < reglas.neumaticoCambiarMm).length;
    const baja = obj ? ne.rows.filter((t) => t.psi < obj * 0.9).length : 0;
    tires = cambiar ? `${cambiar} por cambiar` : baja ? `${baja} con presión baja` : 'En buen estado';
  }
  res.json({ checklist, tires });
}));

function leerUnidad(b, parcial = false) {
  const d = {
    tipo: v.enLista(b.tipo || 'Sprinter', 'Tipo', ['Autobús', 'Sprinter', 'Camioneta', 'Otro']),
    capacidad: v.entero(b.capacidad, 'Capacidad', { min: 1, max: 120 }),
    anio: v.entero(b.anio, 'Año', { min: 1980, max: 2100 }),
    placas: v.texto(b.placas, 'Placas', { max: 15 }).toUpperCase(),
    cliente: v.texto(b.cliente, 'Cliente', { max: 40 }).toUpperCase(),
    choferId: v.entero(b.choferId, 'Chofer', { min: 1 }),
    meta: v.numero(b.metaKml, 'Meta km/L', { min: 0.1, max: 50 }),
    tanque: v.numero(b.tanqueLitros, 'Tanque', { min: 1, max: 2000 }),
    psi: v.entero(b.psiObjetivo, 'Presión objetivo', { min: 20, max: 200 }),
    prox: v.numero(b.proxServicioKm, 'Próximo servicio', { min: 0, max: 5000000 }),
    poliza: v.fecha(b.polizaVence, 'Vencimiento de póliza'),
    polizaNota: v.texto(b.polizaNota, 'Nota de póliza', { max: 80 }),
    tarjeta: v.texto(b.tarjeta, 'Tarjeta de circulación', { max: 40 }) || 'Vigente',
    verificacion: v.texto(b.verificacion, 'Verificación', { max: 40 }) || 'Vigente',
    estado: v.enLista(b.estado || 'operando', 'Estado', ['operando', 'taller', 'baja']),
    nota: v.texto(b.nota, 'Nota', { max: 200 }),
  };
  return d;
}

router.post('/unidades', soloAdmin, h(async (req, res) => {
  const b = req.body || {};
  const unidad = v.texto(b.unidad, 'Unidad', { requerido: true, max: 20 }).toUpperCase();
  if (!PATRON_UNIDAD.test(unidad)) throw new ErrorValidacion('La unidad solo admite letras, números, espacio y guiones.');
  const d = leerUnidad(b);
  const r = await pool.query(
    `INSERT INTO unidades (unidad, tipo, capacidad, anio, placas, cliente, chofer_id, meta_kml, tanque_litros, psi_objetivo,
       prox_servicio_km, poliza_vence, poliza_nota, tarjeta_circulacion, verificacion, estado, nota)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) ON CONFLICT (unidad) DO NOTHING RETURNING unidad`,
    [unidad, d.tipo, d.capacidad, d.anio, d.placas, d.cliente, d.choferId, d.meta, d.tanque, d.psi, d.prox, d.poliza, d.polizaNota, d.tarjeta, d.verificacion, d.estado, d.nota]);
  if (!r.rows.length) return res.status(409).json({ error: `La unidad ${unidad} ya existe.` });
  await auditar(pool, req, 'unidad.alta', { unidad, ...d });
  res.status(201).json({ ok: true });
}));

router.put('/unidades/:unidad', soloAdmin, h(async (req, res) => {
  const unidad = unidadParam(req.params.unidad);
  const d = leerUnidad(req.body || {});
  const r = await pool.query(
    `UPDATE unidades SET tipo=$2, capacidad=$3, anio=$4, placas=$5, cliente=$6, chofer_id=$7, meta_kml=$8, tanque_litros=$9,
       psi_objetivo=$10, prox_servicio_km=$11, poliza_vence=$12, poliza_nota=$13, tarjeta_circulacion=$14, verificacion=$15,
       estado=$16, nota=$17, actualizado_en=now()
     WHERE unidad=$1 RETURNING unidad`,
    [unidad, d.tipo, d.capacidad, d.anio, d.placas, d.cliente, d.choferId, d.meta, d.tanque, d.psi, d.prox, d.poliza, d.polizaNota, d.tarjeta, d.verificacion, d.estado, d.nota]);
  if (!r.rows.length) return res.status(404).json({ error: 'Unidad no encontrada.' });
  await auditar(pool, req, 'unidad.editar', { unidad, ...d });
  res.json({ ok: true });
}));

router.get('/unidades/:unidad/detalle', h(async (req, res) => {
  const unidad = unidadParam(req.params.unidad);
  const r = await pool.query(
    `SELECT unidad, tipo, capacidad, anio, placas, cliente, chofer_id, meta_kml::float, tanque_litros::float, psi_objetivo,
       prox_servicio_km::float, to_char(poliza_vence,'YYYY-MM-DD') poliza_vence, poliza_nota, tarjeta_circulacion, verificacion, estado, nota
     FROM unidades WHERE unidad=$1`, [unidad]);
  if (!r.rows.length) return res.status(404).json({ error: 'Unidad no encontrada.' });
  res.json(r.rows[0]);
}));

// Choferes
router.get('/choferes', h(async (req, res) => {
  const r = await pool.query("SELECT id, nombre, telefono, to_char(licencia_vence,'YYYY-MM-DD') licencia_vence FROM choferes WHERE activo ORDER BY nombre");
  res.json(r.rows);
}));

router.post('/choferes', soloAdmin, h(async (req, res) => {
  const b = req.body || {};
  const nombre = v.texto(b.nombre, 'Nombre', { requerido: true, max: 80 });
  const tel = v.texto(b.telefono, 'Teléfono', { max: 20, patron: /^[0-9 +()-]*$/ });
  const lic = v.fecha(b.licenciaVence, 'Vencimiento de licencia');
  const r = await pool.query('INSERT INTO choferes (nombre, telefono, licencia_vence) VALUES ($1,$2,$3) ON CONFLICT (nombre) DO NOTHING RETURNING id', [nombre, tel, lic]);
  if (!r.rows.length) return res.status(409).json({ error: 'Ese chofer ya existe.' });
  await auditar(pool, req, 'chofer.alta', { nombre });
  res.status(201).json({ id: r.rows[0].id });
}));

module.exports = { router, listaUnidades };

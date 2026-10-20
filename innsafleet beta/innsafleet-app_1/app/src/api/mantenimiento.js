// Pantalla "Mantenimiento" — taller, daño grave/permanente y neumáticos
const express = require('express');
const { pool, v, h, soloAdmin, auditar, ErrorValidacion, leerReglas, c, unidadParam } = require('./comun');

const router = express.Router();
const POS = ['Del. izq.', 'Del. der.', 'Tras. izq. ext.', 'Tras. izq. int.', 'Tras. der. int.', 'Tras. der. ext.'];

router.get('/mantenimiento', h(async (req, res) => {
  const reglas = await leerReglas(pool);
  const hoy = c.hoyLocal();
  const [total, shop, damage, tires] = await Promise.all([
    pool.query("SELECT COUNT(*)::int n FROM unidades WHERE activo"),
    pool.query(`SELECT id, unidad, motivo, taller, tipo, to_char(ingreso,'YYYY-MM-DD') ingreso, to_char(salida_estimada,'YYYY-MM-DD') salida_estimada, estado,
                  ($1::date - ingreso) dias FROM taller WHERE estado <> 'Cerrado' ORDER BY ingreso`, [hoy]),
    pool.query(`SELECT id, unidad, nivel, titulo, detalle, to_char(fecha,'YYYY-MM-DD') fecha, seguimiento, cobertura FROM danos_graves WHERE NOT cerrado ORDER BY fecha DESC`),
    pool.query(`SELECT u.unidad, u.tipo, COALESCE(u.psi_objetivo, 100) objetivo, n.posicion, n.mm::float, n.psi, to_char(n.revisado,'YYYY-MM-DD') revisado
                FROM unidades u LEFT JOIN neumaticos n ON n.unidad = u.unidad WHERE u.activo ORDER BY u.unidad, n.posicion`),
  ]);

  const porUnidad = new Map();
  for (const t of tires.rows) {
    if (!porUnidad.has(t.unidad)) porUnidad.set(t.unidad, { id: t.unidad, type: t.tipo, target: t.objetivo, checked: null, mm: Array(6).fill(null), psi: Array(6).fill(null) });
    const u = porUnidad.get(t.unidad);
    if (t.posicion != null) {
      u.mm[t.posicion] = t.mm;
      u.psi[t.posicion] = t.psi;
      if (!u.checked || t.revisado > u.checked) u.checked = t.revisado;
    }
  }
  const unidadesTaller = new Set(shop.rows.map((s) => s.unidad));
  const unidadesBaja = new Set(damage.rows.map((d) => d.unidad));
  const fuera = (await pool.query("SELECT unidad, estado FROM unidades WHERE activo AND estado <> 'operando'")).rows;
  for (const f of fuera) (f.estado === 'taller' ? unidadesTaller : unidadesBaja).add(f.unidad);

  res.json({
    hoy, minMm: reglas.neumaticoCambiarMm, watchMm: reglas.neumaticoVigilarMm, posiciones: POS,
    total: total.rows[0].n,
    enTaller: unidadesTaller.size,
    fueraServicio: unidadesBaja.size,
    shop: shop.rows,
    damage: damage.rows,
    tires: [...porUnidad.values()],
  });
}));

// --- Taller ---
const ESTADOS_TALLER = ['Diagnóstico', 'Esperando refacción', 'En reparación', 'Listo hoy'];

router.post('/taller', soloAdmin, h(async (req, res) => {
  const b = req.body || {};
  const unidad = unidadParam(b.unidad);
  const motivo = v.texto(b.motivo, 'Motivo', { requerido: true, max: 120 });
  const taller = v.texto(b.taller, 'Taller', { max: 60 }) || 'Taller interno';
  const tipo = v.enLista(b.tipo || 'Correctivo', 'Tipo', ['Preventivo', 'Correctivo']);
  const ingreso = v.fecha(b.ingreso, 'Ingreso') || c.hoyLocal();
  const salida = v.fecha(b.salidaEstimada, 'Salida estimada');
  const estado = v.enLista(b.estado || 'Diagnóstico', 'Estado', ESTADOS_TALLER);
  if (salida && salida < ingreso) throw new ErrorValidacion('La salida estimada no puede ser antes del ingreso.');
  const abierto = await pool.query("SELECT 1 FROM taller WHERE unidad=$1 AND estado <> 'Cerrado'", [unidad]);
  if (abierto.rows.length) return res.status(409).json({ error: `${unidad} ya tiene un ingreso a taller abierto.` });
  const r = await pool.query(
    'INSERT INTO taller (unidad, motivo, taller, tipo, ingreso, salida_estimada, estado, creado_por) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
    [unidad, motivo, taller, tipo, ingreso, salida, estado, req.session.usuario]);
  await pool.query("UPDATE unidades SET estado='taller' WHERE unidad=$1 AND estado='operando'", [unidad]);
  await auditar(pool, req, 'taller.ingreso', { unidad, motivo, tipo });
  res.status(201).json({ id: r.rows[0].id });
}));

router.put('/taller/:id', soloAdmin, h(async (req, res) => {
  const id = v.entero(req.params.id, 'id', { requerido: true, min: 1 });
  const b = req.body || {};
  const cerrar = v.booleano(b.cerrar);
  const estado = cerrar ? 'Cerrado' : v.enLista(b.estado, 'Estado', ESTADOS_TALLER);
  const salida = v.fecha(b.salidaEstimada, 'Salida estimada');
  const r = await pool.query(
    `UPDATE taller SET estado=$2, salida_estimada=COALESCE($3, salida_estimada), salida_real=CASE WHEN $2='Cerrado' THEN $4::date ELSE NULL END
     WHERE id=$1 RETURNING unidad`, [id, estado, salida, c.hoyLocal()]);
  if (!r.rows.length) return res.status(404).json({ error: 'Registro no encontrado.' });
  if (cerrar) {
    const unidad = r.rows[0].unidad;
    const kmSvc = v.booleano(b.fueServicio);
    await pool.query("UPDATE unidades SET estado='operando' WHERE unidad=$1 AND estado='taller'", [unidad]);
    if (kmSvc) {
      const reglas = await leerReglas(pool);
      await pool.query('UPDATE unidades SET prox_servicio_km = odometro_km + $2 WHERE unidad=$1 AND odometro_km IS NOT NULL', [unidad, reglas.intervaloServicioKm]);
    }
  }
  await auditar(pool, req, 'taller.actualizar', { id, estado });
  res.json({ ok: true });
}));

// --- Daño grave o permanente ---
router.post('/danos', soloAdmin, h(async (req, res) => {
  const b = req.body || {};
  const unidad = unidadParam(b.unidad);
  const d = {
    nivel: v.enLista(b.nivel, 'Nivel', ['Grave', 'Permanente']),
    titulo: v.texto(b.titulo, 'Título', { requerido: true, max: 100 }),
    detalle: v.texto(b.detalle, 'Detalle', { max: 300 }),
    fecha: v.fecha(b.fecha, 'Fecha') || c.hoyLocal(),
    seguimiento: v.texto(b.seguimiento, 'Seguimiento', { max: 120 }),
    cobertura: v.texto(b.cobertura, 'Cobertura', { max: 120 }),
  };
  const r = await pool.query(
    'INSERT INTO danos_graves (unidad, nivel, titulo, detalle, fecha, seguimiento, cobertura, creado_por) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
    [unidad, d.nivel, d.titulo, d.detalle, d.fecha, d.seguimiento, d.cobertura, req.session.usuario]);
  await pool.query("UPDATE unidades SET estado='baja' WHERE unidad=$1", [unidad]);
  await auditar(pool, req, 'dano.registrar', { unidad, ...d });
  res.status(201).json({ id: r.rows[0].id });
}));

router.put('/danos/:id', soloAdmin, h(async (req, res) => {
  const id = v.entero(req.params.id, 'id', { requerido: true, min: 1 });
  const b = req.body || {};
  const cerrar = v.booleano(b.cerrar);
  const r = await pool.query(
    'UPDATE danos_graves SET seguimiento=COALESCE($2, seguimiento), cobertura=COALESCE($3, cobertura), cerrado=$4 WHERE id=$1 RETURNING unidad',
    [id, v.texto(b.seguimiento, 'Seguimiento', { max: 120 }) || null, v.texto(b.cobertura, 'Cobertura', { max: 120 }) || null, cerrar]);
  if (!r.rows.length) return res.status(404).json({ error: 'Registro no encontrado.' });
  if (cerrar && v.booleano(b.regresaOperacion)) await pool.query("UPDATE unidades SET estado='operando' WHERE unidad=$1", [r.rows[0].unidad]);
  await auditar(pool, req, 'dano.actualizar', { id, cerrar });
  res.json({ ok: true });
}));

// --- Neumáticos ---
router.put('/neumaticos/:unidad', soloAdmin, h(async (req, res) => {
  const unidad = unidadParam(req.params.unidad);
  const lista = Array.isArray(req.body?.neumaticos) ? req.body.neumaticos : [];
  if (lista.length !== 6) throw new ErrorValidacion('Se esperan las 6 posiciones.');
  const revisado = v.fecha(req.body?.revisado, 'Fecha de revisión') || c.hoyLocal();
  for (let i = 0; i < 6; i++) {
    const mm = v.numero(lista[i]?.mm, `Dibujo ${POS[i]}`, { requerido: true, min: 0, max: 30 });
    const psi = v.entero(lista[i]?.psi, `Presión ${POS[i]}`, { requerido: true, min: 0, max: 200 });
    await pool.query(
      `INSERT INTO neumaticos (unidad, posicion, mm, psi, revisado) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (unidad, posicion) DO UPDATE SET mm=EXCLUDED.mm, psi=EXCLUDED.psi, revisado=EXCLUDED.revisado`,
      [unidad, i, mm, psi, revisado]);
  }
  await auditar(pool, req, 'neumaticos.revision', { unidad, revisado });
  res.json({ ok: true });
}));

module.exports = router;

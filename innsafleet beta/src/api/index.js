// Enrutador principal de la API (todo requiere sesión; escribir requiere rol admin)
const express = require('express');
const samsara = require('../samsara');
const flota = require('../../config/flota');
const { limpiarCache, CLAVES } = require('../reglas');
const { pool, v, h, soloAdmin, auditar, leerReglas, c } = require('./comun');

const router = express.Router();

router.get('/me', h(async (req, res) => {
  const reglas = await leerReglas(pool);
  const est = await pool.query('SELECT clave, valor FROM sync_estado WHERE clave NOT LIKE $1', ['%cursor%']);
  res.json({
    usuario: req.session.usuario,
    rol: req.session.rol,
    empresa: reglas.empresa,
    hoy: c.hoyLocal(),
    zonaHoraria: c.TZ,
    samsara: samsara.hayToken(),
    webhook: Boolean(process.env.SAMSARA_WEBHOOK_SECRET),
    mapaCentro: flota.mapaCentro,
    reglas,
    sync: Object.fromEntries(est.rows.map((r) => [r.clave, r.valor])),
  });
}));

router.put('/reglas', soloAdmin, h(async (req, res) => {
  const b = req.body || {};
  const cambios = {};
  for (const k of CLAVES) {
    if (b[k] === undefined || b[k] === '') continue;
    cambios[k] = v.numero(b[k], k, { min: 0, max: 1000000 });
  }
  if (b.empresa !== undefined) cambios.empresa = v.texto(b.empresa, 'Empresa', { requerido: true, max: 60 });
  for (const [k, val] of Object.entries(cambios)) {
    await pool.query('INSERT INTO configuracion (clave, valor) VALUES ($1,$2) ON CONFLICT (clave) DO UPDATE SET valor=EXCLUDED.valor', [k, String(val)]);
  }
  limpiarCache();
  await auditar(pool, req, 'reglas.editar', cambios);
  res.json(await leerReglas(pool));
}));

router.use(require('./inicio'));
router.use(require('./rutas'));
router.use(require('./unidades').router);
router.use(require('./combustible'));
router.use(require('./reportes').router);
router.use(require('./mantenimiento'));
router.use(require('./checklist'));

router.get('/auditoria', soloAdmin, h(async (req, res) => {
  const r = await pool.query('SELECT usuario, accion, detalle, ip, creado_en FROM auditoria ORDER BY creado_en DESC LIMIT 200');
  res.json(r.rows);
}));

module.exports = router;

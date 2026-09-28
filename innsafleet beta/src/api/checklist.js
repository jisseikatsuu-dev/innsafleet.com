// Pantalla "Checklist" — checklist de salida por unidad y día
const express = require('express');
const def = require('../checklist-def');
const { pool, v, h, soloAdmin, ROLES, auditar, ErrorValidacion, leerReglas, c, unidadParam, fechaParam } = require('./comun');

const router = express.Router();

router.get('/checklist/definicion', (req, res) => {
  res.json({ FUEL: def.FUEL, LEVELS: def.LEVELS, FLUIDS: def.FLUIDS, ZONES: def.ZONES, CHECKS: def.CHECKS, TIPOS_DANO: def.TIPOS_DANO, SEVERIDADES: def.SEVERIDADES });
});

async function infoUnidad(unidad, fecha) {
  const reglas = await leerReglas(pool);
  const u = (await pool.query(
    `SELECT u.unidad, u.tipo, u.capacidad, u.odometro_km::float odo, u.prox_servicio_km::float prox, u.chofer_id,
       to_char(u.poliza_vence,'YYYY-MM-DD') poliza, u.poliza_nota, u.tarjeta_circulacion, ch.nombre chofer, to_char(ch.licencia_vence,'YYYY-MM-DD') licencia
     FROM unidades u LEFT JOIN choferes ch ON ch.id = u.chofer_id WHERE u.unidad=$1`, [unidad])).rows[0];
  if (!u) return null;
  const viaje = (await pool.query(
    `SELECT v.id, v.salida_prog, r.nombre, r.cliente, r.sentido, ch.nombre chofer, v.chofer_id
     FROM viajes v JOIN rutas r ON r.id=v.ruta_id LEFT JOIN choferes ch ON ch.id=v.chofer_id
     WHERE v.unidad=$1 AND v.fecha=$2 AND v.estado <> 'cancelado' ORDER BY v.salida_prog LIMIT 1`, [unidad, fecha])).rows[0];
  const ultimo = (await pool.query(
    "SELECT firmado_en FROM checklists WHERE unidad=$1 AND fecha < $2 AND firmado_en IS NOT NULL ORDER BY fecha DESC LIMIT 1", [unidad, fecha])).rows[0];
  const prox = u.prox ?? (u.odo != null ? Math.ceil((u.odo + 1) / reglas.intervaloServicioKm) * reglas.intervaloServicioKm : null);
  const hora = viaje ? c.horaLocal(viaje.salida_prog) : null;
  return {
    unidad: u.unidad,
    tipo: `${u.tipo}${u.capacidad ? ` ${u.capacidad} pas.` : ''}`,
    chofer: viaje?.chofer || u.chofer || 'Sin asignar',
    choferId: viaje?.chofer_id || u.chofer_id || null,
    ruta: viaje ? `${viaje.nombre} · ${viaje.cliente}` : 'Sin viaje hoy',
    salida: hora ? `${hora} · ${hora < '12:00' ? '1er' : hora < '20:00' ? '2do' : '3er'} turno` : '—',
    odo: u.odo, prox, licencia: u.licencia, poliza: u.poliza, polizaNota: u.poliza_nota, tarjeta: u.tarjeta_circulacion,
    ultimo: ultimo?.firmado_en || null, diasAviso: reglas.diasAvisoDocumentos,
  };
}

function formatear(cl) {
  const ver = def.veredicto({ combustible: cl.combustible, fluidos: cl.fluidos, fallas: cl.fallas, danos: cl.danos });
  return {
    id: cl.id, fecha: cl.fecha, iniciado: c.horaLocal(cl.iniciado_en), combustible: cl.combustible, fluidos: cl.fluidos,
    fallas: cl.fallas, danos: cl.danos, estado: cl.estado, firmadoPor: cl.firmado_por, firmadoEn: cl.firmado_en,
    veredicto: ver.estado, razones: ver.razones,
  };
}

// Obtiene (o crea, si eres admin) el checklist de la unidad para la fecha
router.get('/checklist', h(async (req, res) => {
  const unidad = unidadParam(req.query.unidad);
  const fecha = fechaParam(req.query.fecha);
  const info = await infoUnidad(unidad, fecha);
  if (!info) return res.status(404).json({ error: 'Unidad no encontrada.' });

  let cl = (await pool.query("SELECT *, to_char(fecha,'YYYY-MM-DD') fecha FROM checklists WHERE unidad=$1 AND fecha=$2", [unidad, fecha])).rows[0];
  if (!cl && req.session.rol === ROLES.ADMIN && fecha === c.hoyLocal()) {
    // Arrastra los daños existentes del último checklist como "Existente"
    const prev = (await pool.query("SELECT danos, to_char(fecha,'DD/MM') f FROM checklists WHERE unidad=$1 AND fecha < $2 ORDER BY fecha DESC LIMIT 1", [unidad, fecha])).rows[0];
    const danos = {};
    if (prev) for (const [z, d] of Object.entries(prev.danos || {})) danos[z] = { ...d, prev: d.prev === 'Nuevo' ? `Existente · ${prev.f}` : d.prev };
    const fluidos = Object.fromEntries(def.FLUIDS.map((f) => [f.id, 'Normal']));
    cl = (await pool.query(
      `INSERT INTO checklists (unidad, fecha, chofer_id, fluidos, danos) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (unidad, fecha) DO UPDATE SET unidad=EXCLUDED.unidad RETURNING *, to_char(fecha,'YYYY-MM-DD') fecha`,
      [unidad, fecha, info.choferId, fluidos, danos])).rows[0];
  }
  const fotos = cl ? (await pool.query('SELECT id, zona FROM fotos WHERE checklist_id=$1 ORDER BY id', [cl.id])).rows : [];
  res.json({ info, checklist: cl ? formatear(cl) : null, fotos });
}));

function leerCambios(b) {
  const out = {};
  if (b.combustible !== undefined) out.combustible = v.entero(b.combustible, 'Combustible', { requerido: true, min: 0, max: 4 });
  if (b.fluidos !== undefined) {
    out.fluidos = {};
    for (const f of def.FLUIDS) out.fluidos[f.id] = v.enLista(b.fluidos?.[f.id] || 'Normal', f.label, def.LEVELS);
  }
  if (b.fallas !== undefined) {
    out.fallas = {};
    for (const ch of def.CHECKS) if (b.fallas?.[ch.id]) out.fallas[ch.id] = true;
  }
  if (b.danos !== undefined) {
    out.danos = {};
    for (const z of def.ZONES) {
      const d = b.danos?.[z.id];
      if (!d) continue;
      out.danos[z.id] = {
        type: v.enLista(d.type || 'Otro', 'Tipo de daño', [...def.TIPOS_DANO, 'Por describir']),
        desc: v.texto(d.desc, 'Descripción', { max: 160 }) || 'Agregar descripción y foto',
        sev: v.enLista(d.sev || 'Menor', 'Severidad', [...def.SEVERIDADES, '—']),
        prev: v.texto(d.prev, 'Origen', { max: 40 }) || 'Nuevo',
      };
    }
  }
  return out;
}

async function cargar(id) {
  return (await pool.query("SELECT *, to_char(fecha,'YYYY-MM-DD') fecha FROM checklists WHERE id=$1", [id])).rows[0];
}

router.put('/checklist/:id', soloAdmin, h(async (req, res) => {
  const id = v.entero(req.params.id, 'id', { requerido: true, min: 1 });
  const cl = await cargar(id);
  if (!cl) return res.status(404).json({ error: 'Checklist no encontrado.' });
  if (cl.estado !== 'borrador') throw new ErrorValidacion('Este checklist ya fue firmado; no se puede modificar.');
  const d = { ...cl, ...leerCambios(req.body || {}) };
  const ver = def.veredicto(d);
  const r = await pool.query(
    `UPDATE checklists SET combustible=$2, fluidos=$3, fallas=$4, danos=$5, veredicto=$6 WHERE id=$1 RETURNING *, to_char(fecha,'YYYY-MM-DD') fecha`,
    [id, d.combustible, d.fluidos, d.fallas, d.danos, ver.estado]);
  res.json(formatear(r.rows[0]));
}));

router.post('/checklist/:id/firmar', soloAdmin, h(async (req, res) => {
  const id = v.entero(req.params.id, 'id', { requerido: true, min: 1 });
  const cl = await cargar(id);
  if (!cl) return res.status(404).json({ error: 'Checklist no encontrado.' });
  if (cl.estado !== 'borrador') throw new ErrorValidacion('Este checklist ya fue cerrado.');
  const ver = def.veredicto(cl);
  if (ver.estado === 'no_apta') throw new ErrorValidacion('La unidad no es apta para salir. Envíala a taller o corrige las fallas.');
  const r = await pool.query(
    "UPDATE checklists SET estado='firmado', veredicto=$2, firmado_por=$3, firmado_en=now() WHERE id=$1 RETURNING *, to_char(fecha,'YYYY-MM-DD') fecha",
    [id, ver.estado, req.session.usuario]);
  await auditar(pool, req, 'checklist.firmar', { id, unidad: cl.unidad, veredicto: ver.estado });
  res.json(formatear(r.rows[0]));
}));

router.post('/checklist/:id/taller', soloAdmin, h(async (req, res) => {
  const id = v.entero(req.params.id, 'id', { requerido: true, min: 1 });
  const cl = await cargar(id);
  if (!cl) return res.status(404).json({ error: 'Checklist no encontrado.' });
  const ver = def.veredicto(cl);
  const motivo = (ver.razones.slice(0, 2).join(' · ') || 'Revisión por checklist de salida').slice(0, 120);
  const abierto = await pool.query("SELECT 1 FROM taller WHERE unidad=$1 AND estado <> 'Cerrado'", [cl.unidad]);
  if (!abierto.rows.length) {
    await pool.query(
      "INSERT INTO taller (unidad, motivo, tipo, ingreso, estado, creado_por) VALUES ($1,$2,'Correctivo',$3,'Diagnóstico',$4)",
      [cl.unidad, motivo, c.hoyLocal(), req.session.usuario]);
  }
  await pool.query("UPDATE unidades SET estado='taller' WHERE unidad=$1 AND estado='operando'", [cl.unidad]);
  await pool.query("UPDATE checklists SET estado='a_taller', veredicto=$2 WHERE id=$1", [id, ver.estado]);
  await auditar(pool, req, 'checklist.a_taller', { id, unidad: cl.unidad, motivo });
  res.json({ ok: true });
}));

// --- Fotos de daños (jpeg/png/webp, máx. 5 MB) ---
const FIRMAS = { 'image/jpeg': [0xff, 0xd8, 0xff], 'image/png': [0x89, 0x50, 0x4e, 0x47], 'image/webp': [0x52, 0x49, 0x46, 0x46] };

router.post('/checklist/:id/fotos', soloAdmin, express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '5mb' }), h(async (req, res) => {
  const id = v.entero(req.params.id, 'id', { requerido: true, min: 1 });
  const zona = v.enLista(req.query.zona, 'Zona', def.ZONES.map((z) => z.id));
  const mime = req.get('content-type');
  const firma = FIRMAS[mime];
  if (!firma || !Buffer.isBuffer(req.body) || !firma.every((b, i) => req.body[i] === b)) {
    throw new ErrorValidacion('El archivo no es una imagen JPG, PNG o WEBP válida.');
  }
  const cl = await cargar(id);
  if (!cl) return res.status(404).json({ error: 'Checklist no encontrado.' });
  const n = (await pool.query('SELECT COUNT(*)::int n FROM fotos WHERE checklist_id=$1', [id])).rows[0].n;
  if (n >= 30) throw new ErrorValidacion('Máximo 30 fotos por checklist.');
  const r = await pool.query('INSERT INTO fotos (checklist_id, zona, mime, datos, subido_por) VALUES ($1,$2,$3,$4,$5) RETURNING id', [id, zona, mime, req.body, req.session.usuario]);
  await auditar(pool, req, 'checklist.foto', { id, zona });
  res.status(201).json({ id: r.rows[0].id });
}));

router.get('/fotos/:id', h(async (req, res) => {
  const id = v.entero(req.params.id, 'id', { requerido: true, min: 1 });
  const r = await pool.query('SELECT mime, datos FROM fotos WHERE id=$1', [id]);
  if (!r.rows.length) return res.status(404).json({ error: 'Foto no encontrada.' });
  res.set('Content-Type', r.rows[0].mime);
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Cache-Control', 'private, max-age=86400');
  res.send(r.rows[0].datos);
}));

module.exports = router;

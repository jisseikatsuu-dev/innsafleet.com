// Pantalla "Reportes" — reporte de cliente por día (viajes, usuarios, puntualidad)
const express = require('express');
const { retardo } = require('../viajes');
const { pool, v, h, leerReglas, c, fechaParam, clienteParam } = require('./comun');

const router = express.Router();

function turnoDe(hhmm) {
  const hh = parseInt(hhmm.slice(0, 2), 10);
  return hh < 12 ? '1er turno' : hh < 20 ? '2do turno' : '3er turno';
}

async function viajesDelDia(fecha, cliente) {
  const r = await pool.query(
    `SELECT v.*, r.nombre ruta, r.cliente, r.sentido, ch.nombre chofer, COALESCE(u.capacidad, 0) cap
     FROM viajes v JOIN rutas r ON r.id = v.ruta_id
     LEFT JOIN choferes ch ON ch.id = v.chofer_id LEFT JOIN unidades u ON u.unidad = v.unidad
     WHERE v.fecha = $1 AND v.estado IN ('terminado', 'en_ruta') AND ($2 = '' OR r.cliente = $2)
     ORDER BY v.salida_prog`, [fecha, cliente]);
  return r.rows.map((x) => {
    const time = c.horaLocal(x.salida_prog);
    const delay = Math.max(0, retardo(x));
    return {
      time, shift: turnoDe(time), route: `${x.ruta} · ${x.sentido === 'ENTRADA' ? 'entrada' : 'salida'}`,
      client: x.cliente, unit: x.unidad || '—', driver: x.chofer || 'Sin chofer', riders: x.usuarios, cap: x.cap,
      eta: x.sentido === 'ENTRADA' ? c.horaLocal(x.llegada_prog) : c.horaLocal(x.salida_prog),
      real: x.sentido === 'ENTRADA' ? c.horaLocal(x.llegada_real || x.eta) : c.horaLocal(x.salida_real),
      delay, enCurso: x.estado === 'en_ruta', sentido: x.sentido,
    };
  });
}

router.get('/reportes', h(async (req, res) => {
  const fecha = fechaParam(req.query.fecha || c.sumarDias(c.hoyLocal(), -1));
  const cliente = clienteParam(req.query.cliente);
  const reglas = await leerReglas(pool);
  const clientes = (await pool.query('SELECT DISTINCT cliente FROM rutas WHERE activo ORDER BY cliente')).rows.map((r) => r.cliente);
  res.json({ fecha, tol: reglas.toleranciaRetardoMin, clientes, viajes: await viajesDelDia(fecha, cliente) });
}));

router.get('/reportes/descargar.csv', h(async (req, res) => {
  const fecha = fechaParam(req.query.fecha);
  const cliente = clienteParam(req.query.cliente);
  const reglas = await leerReglas(pool);
  const filas = await viajesDelDia(fecha, cliente);
  const esc = (s) => `"${String(s ?? '').replace(/"/g, '""').replace(/^[=+\-@]/, "'$&")}"`;
  const out = [['Fecha', 'Turno', 'Salida', 'Ruta', 'Cliente', 'Unidad', 'Chofer', 'Usuarios', 'Capacidad', 'Hora programada', 'Hora real', 'Retardo (min)', 'Con retardo'].join(',')];
  for (const t of filas) {
    out.push([fecha, t.shift, t.time, t.route, t.client, t.unit, t.driver, t.riders, t.cap, t.eta, t.real || '', t.delay, t.delay > reglas.toleranciaRetardoMin ? 'Sí' : 'No'].map(esc).join(','));
  }
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="reporte_${cliente || 'todos'}_${fecha}.csv"`);
  res.send('\uFEFF' + out.join('\n'));
}));

module.exports = { router, viajesDelDia, turnoDe };

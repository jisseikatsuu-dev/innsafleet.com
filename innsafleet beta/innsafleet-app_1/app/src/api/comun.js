// Utilidades compartidas por los módulos de la API
const pool = require('../db');
const { v, requiereRol, ROLES, auditar, ErrorValidacion, PATRON_UNIDAD } = require('../seguridad');
const { leerReglas } = require('../reglas');
const c = require('../calculos');

const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const soloAdmin = requiereRol(ROLES.ADMIN);

function unidadParam(valor, campo = 'Unidad') {
  const u = v.texto(valor, campo, { requerido: true, max: 20 }).toUpperCase();
  if (!PATRON_UNIDAD.test(u)) throw new ErrorValidacion(`${campo} tiene un formato inválido.`);
  return u;
}

function fechaParam(valor) {
  return v.fecha(valor, 'fecha') || c.hoyLocal();
}

function clienteParam(valor) {
  const s = v.texto(valor, 'Cliente', { max: 40 }).toUpperCase();
  return s === 'TODOS' ? '' : s;
}

// Estado visible de cada unidad: en ruta / por iniciar / en patio / en taller / fuera de servicio
async function estadosDelDia(fecha) {
  // "Por iniciar" = su siguiente viaje sale en los próximos 90 min (o ya debió salir y no ha salido)
  const r = await pool.query(
    `SELECT DISTINCT ON (v.unidad) v.unidad, v.estado
     FROM viajes v WHERE v.fecha = $1 AND v.unidad IS NOT NULL
       AND (v.estado = 'en_ruta' OR (v.estado = 'por_iniciar' AND v.salida_prog <= now() + interval '90 minutes' AND v.llegada_prog >= now() - interval '60 minutes'))
     ORDER BY v.unidad, (v.estado = 'en_ruta') DESC, v.salida_prog`,
    [fecha]
  );
  return new Map(r.rows.map((x) => [x.unidad, x.estado]));
}

function estadoVisible(u, viajeEstado) {
  if (u.estado === 'baja') return 'baja';
  if (u.estado === 'taller') return 'taller';
  if (viajeEstado === 'en_ruta') return 'ruta';
  if (viajeEstado === 'por_iniciar') return 'iniciar';
  return 'patio';
}

module.exports = { pool, v, h, soloAdmin, ROLES, auditar, ErrorValidacion, leerReglas, c, unidadParam, fechaParam, clienteParam, estadosDelDia, estadoVisible };

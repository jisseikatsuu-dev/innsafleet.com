// =====================================================================
//  Seguridad: usuarios, roles, cabeceras, límites de peticiones,
//  protección CSRF por origen y validación de entradas.
// =====================================================================
const helmet = require('helmet');
const bcrypt = require('bcryptjs');

// ---------------------------------------------------------------------
// Usuarios (sin tabla: vienen de variables de entorno, solo hashes bcrypt)
//   admin    -> todo (capturar, editar metas, geocercas, sincronizar)
//   invitado -> solo lectura
// ---------------------------------------------------------------------
const ROLES = { ADMIN: 'admin', INVITADO: 'invitado' };

function cargarUsuarios() {
  const usuarios = new Map();
  if (process.env.ADMIN_USER && process.env.ADMIN_PASSWORD_HASH) {
    usuarios.set(process.env.ADMIN_USER.trim().toLowerCase(), {
      usuario: process.env.ADMIN_USER.trim(),
      hash: process.env.ADMIN_PASSWORD_HASH,
      rol: ROLES.ADMIN,
    });
  }
  if (process.env.GUEST_PASSWORD_HASH) {
    const u = (process.env.GUEST_USER || 'invitado').trim();
    usuarios.set(u.toLowerCase(), { usuario: u, hash: process.env.GUEST_PASSWORD_HASH, rol: ROLES.INVITADO });
  }
  return usuarios;
}

const USUARIOS = cargarUsuarios();
// Hash falso para que el tiempo de respuesta sea igual exista o no el usuario.
const HASH_FALSO = bcrypt.hashSync('usuario-que-no-existe-' + Math.random(), 10);

async function autenticar(usuario, password) {
  const u = USUARIOS.get(String(usuario).trim().toLowerCase());
  const ok = await bcrypt.compare(String(password), u ? u.hash : HASH_FALSO);
  return ok && u ? { usuario: u.usuario, rol: u.rol } : null;
}

function validarEntorno() {
  const faltan = [];
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    faltan.push('SESSION_SECRET (mínimo 32 caracteres; genera uno con: openssl rand -hex 32)');
  }
  if (!process.env.ADMIN_USER || !process.env.ADMIN_PASSWORD_HASH) {
    faltan.push('ADMIN_USER y ADMIN_PASSWORD_HASH (npm run generar-password -- "contraseña")');
  }
  for (const k of ['ADMIN_PASSWORD_HASH', 'GUEST_PASSWORD_HASH']) {
    if (process.env[k] && !/^\$2[aby]\$\d{2}\$.{53}$/.test(process.env[k])) {
      faltan.push(`${k} no parece un hash bcrypt válido (¿pegaste la contraseña en texto plano?)`);
    }
  }
  if (faltan.length) {
    console.error('Configuración incompleta:\n  - ' + faltan.join('\n  - '));
    process.exit(1);
  }
  if (!process.env.GUEST_PASSWORD_HASH) {
    console.log('[auth] Cuenta invitado deshabilitada (no hay GUEST_PASSWORD_HASH).');
  }
}

// ---------------------------------------------------------------------
// Cabeceras de seguridad (CSP estricta: solo recursos propios + mosaicos OSM)
// ---------------------------------------------------------------------
function cabeceras() {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'"],
        'img-src': ["'self'", 'data:', 'blob:', 'https://*.tile.openstreetmap.org'],
        'font-src': ["'self'"],
        'connect-src': ["'self'"],
        'frame-ancestors': ["'none'"],
        'form-action': ["'self'"],
        'upgrade-insecure-requests': process.env.SESSION_SECURE === 'true' ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false, // mosaicos del mapa
    referrerPolicy: { policy: 'same-origin' },
    hsts: process.env.SESSION_SECURE === 'true' ? { maxAge: 15552000, includeSubDomains: true } : false,
  });
}

// ---------------------------------------------------------------------
// Límite de peticiones en memoria (una instancia). Para varias instancias
// usa Redis, pero para Railway/EC2 con un proceso esto alcanza.
// ---------------------------------------------------------------------
function limitador({ ventanaMs, max, clave = (req) => req.ip, mensaje }) {
  const cubetas = new Map();
  setInterval(() => {
    const ahora = Date.now();
    for (const [k, v] of cubetas) if (ahora > v.reinicio) cubetas.delete(k);
  }, ventanaMs).unref();

  const fn = (req, res, next) => {
    const k = clave(req);
    const ahora = Date.now();
    let c = cubetas.get(k);
    if (!c || ahora > c.reinicio) {
      c = { cuenta: 0, reinicio: ahora + ventanaMs };
      cubetas.set(k, c);
    }
    c.cuenta++;
    if (c.cuenta > max) {
      res.set('Retry-After', String(Math.ceil((c.reinicio - ahora) / 1000)));
      return res.status(429).json({ error: mensaje || 'Demasiadas peticiones. Espera un momento.' });
    }
    next();
  };
  fn.reiniciar = (k) => cubetas.delete(k);
  return fn;
}

// Intentos de login: por IP y por usuario (evita fuerza bruta distribuida a una cuenta)
const loginPorIp = limitador({ ventanaMs: 15 * 60 * 1000, max: 10, mensaje: 'Demasiados intentos. Espera 15 minutos.' });
const loginPorUsuario = limitador({
  ventanaMs: 15 * 60 * 1000,
  max: 8,
  clave: (req) => 'u:' + String(req.body?.usuario || '').trim().toLowerCase(),
  mensaje: 'Esta cuenta tiene demasiados intentos fallidos. Espera 15 minutos.',
});
const api = limitador({ ventanaMs: 60 * 1000, max: 240 });

// ---------------------------------------------------------------------
// CSRF: las peticiones que modifican datos deben venir de este mismo origen.
// (La cookie además es SameSite=Strict.)
// ---------------------------------------------------------------------
function mismoOrigen(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origen = req.get('origin') || req.get('referer');
  if (!origen) return res.status(403).json({ error: 'Origen de la petición no verificable.' });
  let host;
  try {
    host = new URL(origen).host;
  } catch {
    return res.status(403).json({ error: 'Origen inválido.' });
  }
  const permitidos = new Set([req.get('host'), ...(process.env.ORIGENES_PERMITIDOS || '').split(',').map((s) => s.trim()).filter(Boolean)]);
  if (!permitidos.has(host)) return res.status(403).json({ error: 'Origen no permitido.' });
  if (req.is('json') === false && !req.is('image/*') && req.headers['content-length'] > 0) {
    return res.status(415).json({ error: 'Se espera JSON.' });
  }
  next();
}

// ---------------------------------------------------------------------
// Sesión y roles
// ---------------------------------------------------------------------
function requiereSesion(req, res, next) {
  if (req.session?.usuario) return next();
  if (req.path.startsWith('/api')) return res.status(401).json({ error: 'Tu sesión terminó. Vuelve a entrar.' });
  return res.redirect('/login');
}

function requiereRol(...roles) {
  return (req, res, next) => {
    if (roles.includes(req.session?.rol)) return next();
    return res.status(403).json({ error: 'Tu cuenta es de solo lectura.' });
  };
}

// ---------------------------------------------------------------------
// Validación de entradas (sin dependencias). Cada regla lanza un 400 claro.
// ---------------------------------------------------------------------
class ErrorValidacion extends Error {
  constructor(msg) {
    super(msg);
    this.status = 400;
  }
}

const v = {
  texto(valor, campo, { max = 120, requerido = false, patron } = {}) {
    if (valor === undefined || valor === null || valor === '') {
      if (requerido) throw new ErrorValidacion(`${campo} es obligatorio.`);
      return '';
    }
    if (typeof valor !== 'string') throw new ErrorValidacion(`${campo} debe ser texto.`);
    const s = valor.trim().replace(/[\u0000-\u001F\u007F]/g, '');
    if (requerido && !s) throw new ErrorValidacion(`${campo} es obligatorio.`);
    if (s.length > max) throw new ErrorValidacion(`${campo} admite máximo ${max} caracteres.`);
    if (patron && s && !patron.test(s)) throw new ErrorValidacion(`${campo} tiene un formato inválido.`);
    return s;
  },
  numero(valor, campo, { min = -Infinity, max = Infinity, requerido = false } = {}) {
    if (valor === undefined || valor === null || valor === '') {
      if (requerido) throw new ErrorValidacion(`${campo} es obligatorio.`);
      return null;
    }
    const n = typeof valor === 'number' ? valor : Number(String(valor).replace(',', '.'));
    if (!Number.isFinite(n)) throw new ErrorValidacion(`${campo} debe ser un número.`);
    if (n < min || n > max) throw new ErrorValidacion(`${campo} debe estar entre ${min} y ${max}.`);
    return n;
  },
  entero(valor, campo, opts = {}) {
    const n = v.numero(valor, campo, opts);
    if (n !== null && !Number.isInteger(n)) throw new ErrorValidacion(`${campo} debe ser entero.`);
    return n;
  },
  fecha(valor, campo, { requerido = false } = {}) {
    if (!valor) {
      if (requerido) throw new ErrorValidacion(`${campo} es obligatoria.`);
      return null;
    }
    if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor) || isNaN(Date.parse(valor))) {
      throw new ErrorValidacion(`${campo} debe tener formato AAAA-MM-DD.`);
    }
    return valor;
  },
  fechaHora(valor, campo, { requerido = false } = {}) {
    if (!valor) {
      if (requerido) throw new ErrorValidacion(`${campo} es obligatoria.`);
      return null;
    }
    const d = new Date(valor);
    if (typeof valor !== 'string' || isNaN(d)) throw new ErrorValidacion(`${campo} no es una fecha válida.`);
    if (d > new Date(Date.now() + 24 * 3600 * 1000)) throw new ErrorValidacion(`${campo} no puede estar en el futuro.`);
    return d.toISOString();
  },
  booleano(valor) {
    return valor === true || valor === 'true' || valor === 1 || valor === '1';
  },
  enLista(valor, campo, lista) {
    if (!lista.includes(valor)) throw new ErrorValidacion(`${campo} debe ser uno de: ${lista.join(', ')}.`);
    return valor;
  },
  rango(desde, hasta, maxDias = 400) {
    const d = v.fecha(desde, 'desde', { requerido: true });
    const h = v.fecha(hasta, 'hasta', { requerido: true });
    if (d > h) throw new ErrorValidacion('"desde" no puede ser posterior a "hasta".');
    if ((Date.parse(h) - Date.parse(d)) / 86400000 > maxDias) {
      throw new ErrorValidacion(`El rango máximo es de ${maxDias} días.`);
    }
    return { desde: d, hasta: h };
  },
};

const PATRON_UNIDAD = /^[A-Z0-9][A-Z0-9 _-]{0,19}$/;

// ---------------------------------------------------------------------
// Bitácora
// ---------------------------------------------------------------------
async function auditar(pool, req, accion, detalle) {
  try {
    await pool.query('INSERT INTO auditoria (usuario, accion, detalle, ip) VALUES ($1, $2, $3, $4)', [
      req.session?.usuario || 'sistema',
      accion,
      detalle ? JSON.stringify(detalle) : null,
      req.ip,
    ]);
  } catch (err) {
    console.error('[auditoria]', err.message);
  }
}

module.exports = {
  ROLES,
  autenticar,
  validarEntorno,
  cabeceras,
  limitador,
  loginPorIp,
  loginPorUsuario,
  api,
  mismoOrigen,
  requiereSesion,
  requiereRol,
  ErrorValidacion,
  v,
  PATRON_UNIDAD,
  auditar,
};

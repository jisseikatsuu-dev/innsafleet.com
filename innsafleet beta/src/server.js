require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const pool = require('./db');
const samsara = require('./samsara');
const seg = require('./seguridad');
const monitor = require('./monitor');
const { llegadaPorWebhook } = require('./viajes');

seg.validarEntorno();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const PRODUCCION = process.env.NODE_ENV === 'production';

app.disable('x-powered-by');
app.set('trust proxy', Number(process.env.TRUST_PROXY || 1)); // Railway / nginx / ALB
app.use(seg.cabeceras());

// ---------------------------------------------------------------------
// Salud (para Railway / balanceadores) — sin sesión
// ---------------------------------------------------------------------
app.get('/salud', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

// ---------------------------------------------------------------------
// Webhook de Samsara (GeofenceEntry / GeofenceExit)
// Va ANTES del parser JSON porque la firma se calcula sobre el cuerpo crudo.
// URL a registrar en Samsara: https://TU_DOMINIO/webhooks/samsara
// ---------------------------------------------------------------------
app.post(
  '/webhooks/samsara',
  seg.limitador({ ventanaMs: 60 * 1000, max: 600 }),
  express.raw({ type: '*/*', limit: '256kb' }),
  async (req, res) => {
    const secreto = process.env.SAMSARA_WEBHOOK_SECRET;
    if (!secreto) return res.status(503).json({ error: 'Webhook no configurado.' });
    if (!samsara.verificarFirmaWebhook(req.body, req.headers, secreto)) {
      return res.status(401).json({ error: 'Firma inválida.' });
    }

    let payload;
    try {
      payload = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'JSON inválido.' });
    }

    const ev = samsara.normalizarEventoGeocerca(payload);
    if (!ev.tipo) return res.json({ ok: true, ignorado: true }); // otro tipo de evento (ej. ping de prueba)

    try {
      let unidad = ev.nombreVehiculo ? ev.nombreVehiculo.trim().toUpperCase() : null;
      if (ev.samsaraVehicleId) {
        const u = await pool.query('SELECT unidad FROM unidades WHERE samsara_id=$1', [ev.samsaraVehicleId]);
        if (u.rows.length) unidad = u.rows[0].unidad;
      }
      await pool.query(
        `INSERT INTO eventos_geocerca (evento_id, tipo, samsara_vehicle_id, unidad, geocerca_samsara_id, geocerca_nombre, tiempo, payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (evento_id) DO NOTHING`,
        [ev.eventoId, ev.tipo, ev.samsaraVehicleId, unidad, ev.geocercaId, ev.geocercaNombre, ev.tiempo, payload]
      );
      if (ev.tipo === 'entrada') await llegadaPorWebhook(pool, unidad, ev.geocercaNombre, ev.tiempo);
      res.json({ ok: true });
    } catch (err) {
      console.error('[webhook]', err.message);
      res.status(500).json({ error: 'No se pudo guardar el evento.' }); // Samsara reintenta
    }
  }
);

// ---------------------------------------------------------------------
// Parsers y sesión
// ---------------------------------------------------------------------
app.use(express.json({ limit: '100kb' }));

app.use(
  session({
    name: 'cp.sid',
    store: new pgSession({ pool, tableName: 'session', createTableIfMissing: true, pruneSessionInterval: 60 * 15 }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.SESSION_SECURE === 'true',
      maxAge: 1000 * 60 * 60 * Number(process.env.SESION_HORAS || 12),
    },
  })
);

app.use(seg.mismoOrigen);

// ---------------------------------------------------------------------
// Recursos públicos (login, fuentes, estilos)
// ---------------------------------------------------------------------
const estatico = (dir) => express.static(dir, { maxAge: PRODUCCION ? '7d' : 0, index: false });
app.use('/publico', estatico(path.join(__dirname, '..', 'public')));
app.use('/vendor/fuentes/plex-sans', estatico(path.join(__dirname, '..', 'node_modules', '@fontsource', 'ibm-plex-sans', 'files')));
app.use('/vendor/fuentes/plex-mono', estatico(path.join(__dirname, '..', 'node_modules', '@fontsource', 'ibm-plex-mono', 'files')));

app.get('/login', (req, res) => {
  if (req.session?.usuario) return res.redirect('/');
  res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});

app.post('/login', seg.loginPorIp, seg.loginPorUsuario, async (req, res, next) => {
  try {
    const usuario = typeof req.body?.usuario === 'string' ? req.body.usuario.slice(0, 60) : '';
    const password = typeof req.body?.password === 'string' ? req.body.password.slice(0, 200) : '';
    if (!usuario || !password) return res.status(400).json({ error: 'Escribe usuario y contraseña.' });

    const cuenta = await seg.autenticar(usuario, password);
    if (!cuenta) {
      await seg.auditar(pool, { ip: req.ip, session: { usuario } }, 'login.fallido', null);
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }

    seg.loginPorIp.reiniciar(req.ip);
    seg.loginPorUsuario.reiniciar('u:' + usuario.trim().toLowerCase());

    // Nueva sesión para evitar fijación de sesión
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.usuario = cuenta.usuario;
      req.session.rol = cuenta.rol;
      req.session.save(async (err2) => {
        if (err2) return next(err2);
        await seg.auditar(pool, req, 'login.ok', { rol: cuenta.rol });
        res.json({ ok: true, rol: cuenta.rol });
      });
    });
  } catch (err) {
    next(err);
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('cp.sid');
    res.json({ ok: true });
  });
});

// ---------------------------------------------------------------------
// A partir de aquí todo requiere sesión
// ---------------------------------------------------------------------
app.use(seg.requiereSesion);
app.use('/vendor/leaflet', estatico(path.join(__dirname, '..', 'node_modules', 'leaflet', 'dist')));
app.use('/api', seg.api, require('./api'));
app.use(estatico(path.join(__dirname, '..', 'public', 'app')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'app', 'index.html')));

// 404
app.use((req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Ruta no encontrada.' });
  res.status(404).send('No encontrado');
});

// Manejador central de errores: nunca expone stack ni SQL al cliente
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'La petición es demasiado grande.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido.' });
  const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  if (status >= 500) console.error(`[error] ${req.method} ${req.path}:`, err.message);
  // Errores de restricciones de Postgres -> 400 legible
  if (err.code === '23514' || err.code === '23503') return res.status(400).json({ error: 'Los datos no cumplen las reglas de la base de datos.' });
  res.status(status).json({ error: status === 500 ? 'Error interno. Revisa los logs del servidor.' : err.message });
});

app.listen(PORT, () => {
  console.log(`Control de Patio escuchando en :${PORT}`);
  monitor.iniciar();
  if (!samsara.hayToken()) console.log('[samsara] Sin SAMSARA_API_TOKEN: el sistema funciona con captura manual (sin GPS en vivo).');
});

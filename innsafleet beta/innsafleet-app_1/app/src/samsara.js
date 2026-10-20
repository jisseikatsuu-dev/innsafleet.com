// =====================================================================
//  Cliente de la API de Samsara
//  Docs: https://developers.samsara.com/reference
//
//  Endpoints usados:
//   GET    /fleet/vehicles                         -> catálogo (nombre -> id)
//   GET    /fleet/vehicles/stats                   -> último dato (tiempo real)
//   GET    /fleet/vehicles/stats/feed              -> feed incremental con cursor (cron)
//   GET    /fleet/reports/vehicles/fuel-energy     -> distancia + combustible consumido por periodo
//   GET    /addresses                              -> geocercas en Samsara
//   POST   /addresses                              -> crear geocerca circular
//   DELETE /addresses/{id}                         -> borrar geocerca
//   Webhooks GeofenceEntry / GeofenceExit          -> verificación de firma HMAC
//
//  Permisos que necesita el token (Settings > API Tokens):
//   - Read Vehicles, Read Vehicle Statistics, Read Fuel & Energy
//   - Read Addresses, Write Addresses (solo si vas a crear/borrar geocercas)
// =====================================================================

const crypto = require('crypto');

const BASE_URL = process.env.SAMSARA_BASE_URL || 'https://api.samsara.com'; // UE: https://api.eu.samsara.com
const TIMEOUT_MS = 20000;
const MAX_REINTENTOS = 3;

function hayToken() {
  return Boolean(process.env.SAMSARA_API_TOKEN);
}

function headers() {
  if (!hayToken()) {
    const e = new Error('Samsara no está configurado (falta SAMSARA_API_TOKEN).');
    e.status = 503;
    throw e;
  }
  return {
    Authorization: `Bearer ${process.env.SAMSARA_API_TOKEN}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Petición genérica con timeout y reintentos en 429 / 5xx.
async function peticion(ruta, { metodo = 'GET', params = {}, body } = {}) {
  const url = new URL(ruta, BASE_URL);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    url.searchParams.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }

  for (let intento = 1; intento <= MAX_REINTENTOS; intento++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res;
    try {
      res = await fetch(url, {
        method: metodo,
        headers: headers(),
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
    } catch (err) {
      clearTimeout(t);
      if (intento === MAX_REINTENTOS) {
        const e = new Error(`No se pudo conectar con Samsara (${err.name === 'AbortError' ? 'timeout' : err.message}).`);
        e.status = 502;
        throw e;
      }
      await esperar(1000 * intento);
      continue;
    }
    clearTimeout(t);

    if (res.status === 429 || res.status >= 500) {
      if (intento === MAX_REINTENTOS) break;
      const retryAfter = Number(res.headers.get('retry-after')) || intento;
      await esperar(Math.min(retryAfter, 10) * 1000);
      continue;
    }

    if (res.status === 204) return {};
    const texto = await res.text();
    if (!res.ok) {
      // No se expone el cuerpo completo al cliente; se registra en logs.
      console.error(`[samsara] ${metodo} ${url.pathname} -> ${res.status}: ${texto.slice(0, 500)}`);
      const e = new Error(
        res.status === 401 || res.status === 403
          ? 'Samsara rechazó el token (revisa SAMSARA_API_TOKEN y sus permisos).'
          : `Samsara respondió ${res.status} en ${url.pathname}.`
      );
      e.status = 502;
      throw e;
    }
    return texto ? JSON.parse(texto) : {};
  }
  const e = new Error('Samsara está limitando las peticiones (429). Intenta en un momento.');
  e.status = 503;
  throw e;
}

// Recorre todas las páginas de un endpoint con cursor (pagination.endCursor).
async function paginarTodo(ruta, params = {}, extraer = (d) => d.data || []) {
  const todo = [];
  let after;
  let vueltas = 0;
  do {
    const data = await peticion(ruta, { params: { ...params, after } });
    todo.push(...extraer(data));
    after = data.pagination?.hasNextPage ? data.pagination.endCursor : null;
    if (++vueltas > 500) break; // salvavidas
  } while (after);
  return todo;
}

// ---------------------------------------------------------------------
// Vehículos
// ---------------------------------------------------------------------
async function listarVehiculos() {
  return paginarTodo('/fleet/vehicles', { limit: 512 });
}

// Sincroniza unidades.samsara_id usando el nombre del vehículo en Samsara.
// Crea las unidades que existan en Samsara y no en la BD (sin meta).
async function syncVehiculos(pool) {
  const vehiculos = await listarVehiculos();
  let vinculados = 0;
  let nuevos = 0;
  for (const v of vehiculos) {
    const nombre = String(v.name || '').trim().toUpperCase();
    if (!nombre) continue;
    // Libera el samsara_id si estaba en otra unidad (renombres en Samsara)
    await pool.query('UPDATE unidades SET samsara_id = NULL WHERE samsara_id = $1 AND unidad <> $2', [String(v.id), nombre]);
    const r = await pool.query(
      `INSERT INTO unidades (unidad, samsara_id) VALUES ($1, $2)
       ON CONFLICT (unidad) DO UPDATE SET samsara_id = EXCLUDED.samsara_id, actualizado_en = now()
       RETURNING (xmax = 0) AS insertado`,
      [nombre, String(v.id)]
    );
    if (r.rows[0]?.insertado) nuevos++;
    vinculados++;
  }
  return { totalSamsara: vehiculos.length, vinculados, nuevos };
}

// ---------------------------------------------------------------------
// Tiempo real: último valor de cada stat por vehículo
// ---------------------------------------------------------------------
const TIPOS_TIEMPO_REAL = ['gps', 'fuelPercents', 'obdOdometerMeters', 'engineStates'];

async function statsActuales(vehicleIds) {
  const params = { types: TIPOS_TIEMPO_REAL };
  if (vehicleIds && vehicleIds.length) params.vehicleIds = vehicleIds;
  const filas = await paginarTodo('/fleet/vehicles/stats', params);

  return filas.map((v) => {
    const gps = v.gps || null;
    return {
      samsaraId: String(v.id),
      nombre: v.name || null,
      gps: gps
        ? {
            tiempo: gps.time,
            lat: gps.latitude,
            lng: gps.longitude,
            rumbo: gps.headingDegrees ?? null,
            velocidadKmh: gps.speedMilesPerHour != null ? +(gps.speedMilesPerHour * 1.609344).toFixed(1) : null,
            ubicacion: gps.reverseGeo?.formattedLocation || null,
            // Si el vehículo está dentro de una address/geocerca de Samsara:
            geocercaSamsara: gps.address ? { id: String(gps.address.id), nombre: gps.address.name } : null,
          }
        : null,
      combustiblePct: v.fuelPercent ? { tiempo: v.fuelPercent.time, valor: v.fuelPercent.value } : null,
      odometroKm: v.obdOdometerMeters
        ? { tiempo: v.obdOdometerMeters.time, valor: +(v.obdOdometerMeters.value / 1000).toFixed(1) }
        : null,
      motor: v.engineState ? { tiempo: v.engineState.time, valor: v.engineState.value } : null, // On / Off / Idle
    };
  });
}

// ---------------------------------------------------------------------
// Feed incremental (para el cron). Devuelve lecturas + el cursor nuevo.
// ---------------------------------------------------------------------
const TIPOS_FEED = ['fuelPercents', 'obdOdometerMeters', 'engineStates'];
const MAPA_TIPO_FEED = {
  fuelPercents: 'fuelPercent',
  obdOdometerMeters: 'obdOdometerMeters',
  gpsOdometerMeters: 'gpsOdometerMeters',
  engineStates: 'engineState',
};

async function leerFeed(cursor, maxPaginas = 50) {
  const lecturas = [];
  let after = cursor || undefined;
  let paginas = 0;
  let ultimoCursor = cursor || null;

  while (paginas < maxPaginas) {
    const data = await peticion('/fleet/vehicles/stats/feed', { params: { types: TIPOS_FEED, after } });
    for (const v of data.data || []) {
      for (const [campo, tipo] of Object.entries(MAPA_TIPO_FEED)) {
        const arr = v[campo];
        if (!Array.isArray(arr)) continue;
        for (const p of arr) {
          const esNum = typeof p.value === 'number';
          lecturas.push({
            samsaraId: String(v.id),
            tipo,
            tiempo: p.time,
            valorNum: esNum ? p.value : null,
            valorTxt: esNum ? null : String(p.value),
          });
        }
      }
    }
    ultimoCursor = data.pagination?.endCursor || ultimoCursor;
    paginas++;
    if (!data.pagination?.hasNextPage) break;
    after = data.pagination.endCursor;
  }
  return { lecturas, cursor: ultimoCursor, paginas };
}

// ---------------------------------------------------------------------
// Reporte de combustible y energía (distancia + litros por periodo)
// startDate / endDate en RFC 3339 (ej. 2026-09-01T06:00:00Z)
// ---------------------------------------------------------------------
async function reporteCombustible(inicioISO, finISO, vehicleIds) {
  const params = { startDate: inicioISO, endDate: finISO };
  if (vehicleIds && vehicleIds.length) params.vehicleIds = vehicleIds;
  const reportes = await paginarTodo('/fleet/reports/vehicles/fuel-energy', params, (d) => d.data?.vehicleReports || []);

  return reportes.map((r) => ({
    samsaraId: String(r.vehicle?.id),
    nombre: r.vehicle?.name || null,
    distanciaKm: (Number(r.distanceTraveledMeters) || 0) / 1000,
    litros: (Number(r.fuelConsumedMl) || 0) / 1000,
    horasMotor: (Number(r.engineRunTimeDurationMs) || 0) / 3600000,
    horasRalenti: (Number(r.engineIdleTimeDurationMs) || 0) / 3600000,
    costo: r.estFuelEnergyCost?.amount != null ? Number(r.estFuelEnergyCost.amount) : null,
    moneda: r.estFuelEnergyCost?.currencyCode || null,
  }));
}

// ---------------------------------------------------------------------
// Geocercas (Samsara las llama "addresses" con un "geofence")
// ---------------------------------------------------------------------
async function listarGeocercas() {
  const addresses = await paginarTodo('/addresses', { limit: 512 });
  return addresses.map((a) => {
    const c = a.geofence?.circle;
    return {
      samsaraId: String(a.id),
      nombre: a.name,
      direccion: a.formattedAddress || '',
      lat: c?.latitude ?? a.latitude ?? null,
      lng: c?.longitude ?? a.longitude ?? null,
      radioM: c?.radiusMeters ?? null,
      esPoligono: Boolean(a.geofence?.polygon),
    };
  });
}

async function crearGeocerca({ nombre, lat, lng, radioM, direccion }) {
  const body = {
    name: nombre,
    formattedAddress: direccion || `${lat}, ${lng}`,
    geofence: { circle: { latitude: lat, longitude: lng, radiusMeters: radioM } },
  };
  const r = await peticion('/addresses', { metodo: 'POST', body });
  return { samsaraId: String(r.data?.id) };
}

async function actualizarGeocerca(samsaraId, { nombre, lat, lng, radioM }) {
  const body = {
    name: nombre,
    geofence: { circle: { latitude: lat, longitude: lng, radiusMeters: radioM } },
  };
  await peticion(`/addresses/${encodeURIComponent(samsaraId)}`, { metodo: 'PATCH', body });
}

async function eliminarGeocerca(samsaraId) {
  await peticion(`/addresses/${encodeURIComponent(samsaraId)}`, { metodo: 'DELETE' });
}

// ---------------------------------------------------------------------
// Webhooks: verificación de firma
//  Samsara firma cada envío con:
//    X-Samsara-Timestamp: <unix seg>
//    X-Samsara-Signature: v1=<hex HMAC-SHA256>
//  Mensaje firmado: "v1:<timestamp>:<cuerpo crudo>"
//  Llave: el "secret key" del webhook (viene en base64).
// ---------------------------------------------------------------------
function verificarFirmaWebhook(cuerpoCrudo, cabeceras, secretoBase64, toleranciaSeg = 300) {
  if (!secretoBase64) return false;
  const ts = cabeceras['x-samsara-timestamp'];
  const firma = cabeceras['x-samsara-signature'];
  if (!ts || !firma) return false;

  const edad = Math.abs(Date.now() / 1000 - Number(ts));
  if (!Number.isFinite(edad) || edad > toleranciaSeg) return false; // anti-replay

  const llave = Buffer.from(secretoBase64, 'base64');
  const esperada =
    'v1=' + crypto.createHmac('sha256', llave).update(`v1:${ts}:`).update(cuerpoCrudo).digest('hex');

  const a = Buffer.from(esperada);
  const b = Buffer.from(String(firma));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Normaliza el payload de GeofenceEntry / GeofenceExit (formato nuevo y legado).
function normalizarEventoGeocerca(payload) {
  const tipoRaw = payload.eventType || payload.event?.eventType || '';
  const tipo = /exit/i.test(tipoRaw) ? 'salida' : /entry/i.test(tipoRaw) ? 'entrada' : null;
  const d = payload.data || payload.event?.details || payload.event || {};
  const vehiculo = d.vehicle || d.asset || {};
  const address = d.address || d.geofence || {};
  return {
    eventoId: payload.eventId || payload.event?.eventId || null,
    tipo,
    tiempo: payload.eventTime || payload.eventMs ? new Date(payload.eventTime || Number(payload.eventMs)) : new Date(),
    samsaraVehicleId: vehiculo.id != null ? String(vehiculo.id) : null,
    nombreVehiculo: vehiculo.name || null,
    geocercaId: address.id != null ? String(address.id) : null,
    geocercaNombre: address.name || null,
  };
}

module.exports = {
  hayToken,
  listarVehiculos,
  syncVehiculos,
  statsActuales,
  leerFeed,
  reporteCombustible,
  listarGeocercas,
  crearGeocerca,
  actualizarGeocerca,
  eliminarGeocerca,
  verificarFirmaWebhook,
  normalizarEventoGeocerca,
};

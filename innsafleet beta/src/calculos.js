// =====================================================================
//  Cálculos de rendimiento, fechas por zona horaria y geocercas
// =====================================================================

const TZ = process.env.TZ_ZONA || 'America/Monterrey';

// Minutos de diferencia entre la zona TZ y UTC en un instante dado.
function offsetMinutos(fecha, tz = TZ) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(fecha)
      .map((p) => [p.type, p.value])
  );
  const comoUTC = Date.UTC(partes.year, partes.month - 1, partes.day, partes.hour, partes.minute, partes.second);
  return (comoUTC - fecha.getTime()) / 60000;
}

// "2026-09-28" -> Date del inicio de ese día en la zona local
function inicioDiaLocal(fechaStr, tz = TZ) {
  const [y, m, d] = fechaStr.split('-').map(Number);
  const aprox = Date.UTC(y, m - 1, d);
  return new Date(aprox - offsetMinutos(new Date(aprox), tz) * 60000);
}

function sumarDias(fechaStr, n) {
  const d = new Date(fechaStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function hoyLocal(tz = TZ) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function listaDias(desde, hasta) {
  const dias = [];
  for (let d = desde; d <= hasta; d = sumarDias(d, 1)) dias.push(d);
  return dias;
}

// "2026-09-28" + "05:30" -> Date (instante UTC de esa hora local)
function fechaHoraLocal(fechaStr, hhmm, tz = TZ) {
  const [h, m] = String(hhmm).split(':').map(Number);
  const base = inicioDiaLocal(fechaStr, tz);
  const aprox = new Date(base.getTime() + (h * 60 + m) * 60000);
  // Corrige si hubo cambio de horario entre medianoche y esa hora
  const ajuste = offsetMinutos(base, tz) - offsetMinutos(aprox, tz);
  return new Date(aprox.getTime() + ajuste * 60000);
}

// Date -> "HH:MM" en hora local
function horaLocal(fecha, tz = TZ) {
  if (!fecha) return null;
  return new Intl.DateTimeFormat('es-MX', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(fecha));
}

// Date -> "YYYY-MM-DD" local
function fechaLocal(fecha, tz = TZ) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(fecha));
}

// 0 = domingo … 6 = sábado
function diaSemana(fechaStr) {
  return new Date(fechaStr + 'T12:00:00Z').getUTCDay();
}

const minutosEntre = (a, b) => (a && b ? Math.round((new Date(b) - new Date(a)) / 60000) : null);

// Distancia en metros entre dos puntos (Haversine)
function distanciaM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const rad = (g) => (g * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Regresa la geocerca local que contiene el punto (la más cercana si se traslapan)
function geocercaDelPunto(lat, lng, geocercas) {
  if (lat == null || lng == null) return null;
  let mejor = null;
  for (const g of geocercas) {
    if (g.lat == null || g.lng == null || !g.activo) continue;
    const d = distanciaM(lat, lng, g.lat, g.lng);
    if (d <= g.radio_m && (!mejor || d < mejor.distancia)) mejor = { id: g.id, nombre: g.nombre, tipo: g.tipo, distancia: Math.round(d) };
  }
  return mejor;
}

// ---------------------------------------------------------------------
// Rendimiento por método "tanque lleno a tanque lleno" con cargas manuales:
//   km recorridos entre dos llenados completos / litros cargados después
//   del primero hasta el segundo (incluyendo cargas parciales intermedias).
// cargas: ordenadas por fecha_hora ASC, de UNA unidad.
// ---------------------------------------------------------------------
function rendimientoPorCargas(cargas) {
  const tramos = [];
  let inicio = null;
  let litrosAcum = 0;
  let costoAcum = 0;

  for (const c of cargas) {
    const litros = Number(c.litros);
    const odo = c.odometro_km != null ? Number(c.odometro_km) : null;
    if (inicio) {
      litrosAcum += litros;
      costoAcum += litros * (Number(c.precio_litro) || 0);
    }
    if (c.tanque_lleno && odo != null) {
      if (inicio && odo > inicio.odo) {
        const km = odo - inicio.odo;
        tramos.push({
          desde: inicio.fecha,
          hasta: c.fecha_hora,
          km,
          litros: litrosAcum,
          kml: litrosAcum > 0 ? km / litrosAcum : null,
          costo: costoAcum,
        });
      }
      inicio = { odo, fecha: c.fecha_hora };
      litrosAcum = 0;
      costoAcum = 0;
    }
  }

  const km = tramos.reduce((s, t) => s + t.km, 0);
  const litros = tramos.reduce((s, t) => s + t.litros, 0);
  return { tramos, km, litros, kml: litros > 0 ? km / litros : null };
}

// Semáforo contra la meta
function estadoVsMeta(kml, meta, toleranciaPct) {
  if (kml == null || !meta) return 'sin-dato';
  const desviacion = ((kml - meta) / meta) * 100;
  if (desviacion >= 0) return 'ok';
  if (desviacion >= -toleranciaPct) return 'alerta';
  return 'bajo';
}

const redondear = (n, d = 2) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d);

module.exports = {
  TZ,
  fechaHoraLocal,
  horaLocal,
  fechaLocal,
  diaSemana,
  minutosEntre,
  inicioDiaLocal,
  sumarDias,
  hoyLocal,
  listaDias,
  distanciaM,
  geocercaDelPunto,
  rendimientoPorCargas,
  estadoVsMeta,
  redondear,
};

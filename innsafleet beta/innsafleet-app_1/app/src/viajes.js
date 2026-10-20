// =====================================================================
//  Viajes del día: generación desde las rutas y seguimiento con el GPS
// =====================================================================
const c = require('./calculos');

// Crea los viajes de una fecha a partir de las rutas activas (idempotente)
async function generarViajes(pool, fecha) {
  const dia = String(c.diaSemana(fecha));
  const rutas = await pool.query(
    `SELECT r.*, u.chofer_id AS chofer_unidad
     FROM rutas r LEFT JOIN unidades u ON u.unidad = r.unidad
     WHERE r.activo`
  );
  let creados = 0;
  for (const r of rutas.rows) {
    if (!r.dias.split(',').map((s) => s.trim()).includes(dia)) continue;
    const hora = String(r.hora).slice(0, 5);
    const base = c.fechaHoraLocal(fecha, hora);
    const salida = r.sentido === 'ENTRADA' ? new Date(base.getTime() - r.duracion_min * 60000) : base;
    const llegada = r.sentido === 'ENTRADA' ? base : new Date(base.getTime() + r.duracion_min * 60000);

    const ins = await pool.query(
      `INSERT INTO viajes (fecha, ruta_id, unidad, chofer_id, salida_prog, llegada_prog)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (fecha, ruta_id) DO NOTHING RETURNING id`,
      [fecha, r.id, r.unidad, r.chofer_id || r.chofer_unidad || null, salida, llegada]
    );
    if (!ins.rows.length) continue;
    creados++;
    await pool.query(
      `INSERT INTO viaje_paradas (viaje_id, parada_id, hora_prog)
       SELECT $1, p.id, $2::timestamptz + (p.min_desde_inicio || ' minutes')::interval
       FROM paradas p WHERE p.ruta_id = $3`,
      [ins.rows[0].id, salida, r.id]
    );
  }
  return creados;
}

// Minutos de retardo del viaje (+ = tarde). ENTRADA mide llegada a planta; SALIDA mide salida de planta.
function retardo(v) {
  if (v.sentido === 'SALIDA') {
    if (v.salida_real) return c.minutosEntre(v.salida_prog, v.salida_real);
    if (v.estado === 'por_iniciar' && new Date() > new Date(v.salida_prog)) return c.minutosEntre(v.salida_prog, new Date());
    return 0;
  }
  if (v.llegada_real) return c.minutosEntre(v.llegada_prog, v.llegada_real);
  if (v.eta) return Math.max(0, c.minutosEntre(v.llegada_prog, v.eta));
  return 0;
}

// ---------------------------------------------------------------------
// Seguimiento con GPS (lo llama el monitor en cada vuelta)
// ---------------------------------------------------------------------
async function actualizarConGps(pool, gpsPorUnidad, odoPorUnidad, reglas) {
  const hoy = c.hoyLocal();
  const ayer = c.sumarDias(hoy, -1);
  const activos = await pool.query(
    `SELECT v.*, r.sentido, r.cliente, r.nombre AS ruta_nombre
     FROM viajes v JOIN rutas r ON r.id = v.ruta_id
     WHERE v.fecha IN ($1, $2) AND v.estado IN ('por_iniciar', 'en_ruta')`,
    [hoy, ayer]
  );
  if (!activos.rows.length) return 0;

  const plantas = await pool.query("SELECT cliente, lat, lng, radio_m FROM geocercas WHERE tipo = 'PLANTA' AND activo AND lat IS NOT NULL");
  const plantaDe = new Map(plantas.rows.map((p) => [p.cliente, p]));
  const ahora = new Date();
  let cambios = 0;

  for (const v of activos.rows) {
    const gps = v.unidad ? gpsPorUnidad.get(v.unidad) : null;
    if (!gps || gps.lat == null) continue;
    // Solo seguimos viajes en su ventana de tiempo (30 min antes de salir a 3 h después de la llegada programada)
    if (ahora < new Date(new Date(v.salida_prog).getTime() - 30 * 60000)) continue;
    if (ahora > new Date(new Date(v.llegada_prog).getTime() + 180 * 60000)) {
      await pool.query("UPDATE viajes SET estado = 'terminado' WHERE id = $1 AND estado = 'en_ruta'", [v.id]);
      continue;
    }

    const tiempo = gps.tiempo ? new Date(gps.tiempo) : ahora;
    const planta = plantaDe.get(v.cliente);
    const enPlanta = planta ? c.distanciaM(gps.lat, gps.lng, planta.lat, planta.lng) <= planta.radio_m : false;
    const paradas = (
      await pool.query(
        `SELECT vp.*, p.orden, p.lat, p.lng, p.nombre FROM viaje_paradas vp JOIN paradas p ON p.id = vp.parada_id
         WHERE vp.viaje_id = $1 ORDER BY p.orden`,
        [v.id]
      )
    ).rows;

    const ultimo = { lat: gps.lat, lng: gps.lng, kmh: gps.velocidadKmh, tiempo: gps.tiempo, odo_inicio: v.ultimo_gps?.odo_inicio ?? null };
    const odo = odoPorUnidad.get(v.unidad);
    let estado = v.estado;
    let salidaReal = v.salida_real;
    let llegadaReal = v.llegada_real;

    // Inicio del viaje
    if (estado === 'por_iniciar') {
      const primera = paradas[0];
      const enPrimera = primera?.lat != null && c.distanciaM(gps.lat, gps.lng, primera.lat, primera.lng) <= reglas.radioParadaM;
      const salioDePlanta = v.sentido === 'SALIDA' && planta && !enPlanta && (gps.velocidadKmh || 0) > 5 && ahora >= new Date(new Date(v.salida_prog).getTime() - 15 * 60000);
      if ((v.sentido === 'ENTRADA' && enPrimera) || salioDePlanta) {
        estado = 'en_ruta';
        salidaReal = tiempo;
        if (odo != null) ultimo.odo_inicio = odo;
      }
    }

    if (estado === 'en_ruta') {
      // Paradas: marca la que se alcanza y omite las pendientes anteriores
      for (let i = 0; i < paradas.length; i++) {
        const p = paradas[i];
        if (p.estado !== 'pendiente' || p.lat == null) continue;
        if (c.distanciaM(gps.lat, gps.lng, p.lat, p.lng) <= reglas.radioParadaM) {
          await pool.query("UPDATE viaje_paradas SET estado='ok', hora_real=$3 WHERE viaje_id=$1 AND parada_id=$2", [v.id, p.parada_id, tiempo]);
          await pool.query(
            `UPDATE viaje_paradas SET estado='omitida', motivo='La unidad no se detuvo'
             WHERE viaje_id=$1 AND estado='pendiente' AND parada_id IN (SELECT id FROM paradas WHERE ruta_id=$2 AND orden < $3)`,
            [v.id, v.ruta_id, p.orden]
          );
          p.estado = 'ok';
          p.hora_real = tiempo;
          cambios++;
        }
      }
      // Fin del viaje
      const pendientes = paradas.filter((p) => p.estado === 'pendiente');
      const terminoEntrada = v.sentido === 'ENTRADA' && enPlanta;
      const terminoSalida = v.sentido === 'SALIDA' && paradas.length > 0 && pendientes.length === 0;
      if (terminoEntrada || terminoSalida) {
        estado = 'terminado';
        llegadaReal = tiempo;
        await pool.query("UPDATE viaje_paradas SET estado='omitida', motivo='No se registró paso por la parada' WHERE viaje_id=$1 AND estado='pendiente'", [v.id]);
      }
    }

    // ETA: llegada programada + atraso acumulado en la última parada visitada
    let eta = null;
    if (estado === 'en_ruta') {
      const vistas = paradas.filter((p) => p.estado === 'ok' && p.hora_real);
      const ultimaVista = vistas[vistas.length - 1];
      const atraso = ultimaVista ? Math.max(0, c.minutosEntre(ultimaVista.hora_prog, ultimaVista.hora_real)) : Math.max(0, c.minutosEntre(v.salida_prog, salidaReal || ahora));
      eta = new Date(new Date(v.llegada_prog).getTime() + atraso * 60000);
    }

    const km = ultimo.odo_inicio != null && odo != null ? Math.max(0, odo - ultimo.odo_inicio) : v.km;
    await pool.query(
      'UPDATE viajes SET estado=$2, salida_real=$3, llegada_real=$4, ultimo_gps=$5, eta=$6, km=$7 WHERE id=$1',
      [v.id, estado, salidaReal, llegadaReal, ultimo, eta, km]
    );
    cambios++;
  }
  return cambios;
}

// Llegada a planta por webhook de Samsara (GeofenceEntry)
async function llegadaPorWebhook(pool, unidad, geocercaNombre, tiempo) {
  const g = await pool.query("SELECT cliente FROM geocercas WHERE tipo='PLANTA' AND nombre=$1", [geocercaNombre]);
  if (!g.rows.length || !unidad) return;
  await pool.query(
    `UPDATE viajes v SET estado='terminado', llegada_real=$3
     FROM rutas r WHERE r.id = v.ruta_id AND v.unidad=$1 AND r.cliente=$2 AND r.sentido='ENTRADA'
       AND v.estado='en_ruta' AND v.fecha IN ($4, $5)`,
    [unidad, g.rows[0].cliente, tiempo, c.hoyLocal(), c.sumarDias(c.hoyLocal(), -1)]
  );
}

module.exports = { generarViajes, retardo, actualizarConGps, llegadaPorWebhook };

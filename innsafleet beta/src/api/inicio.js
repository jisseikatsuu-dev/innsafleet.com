// Pantalla "Inicio" (Panel general) y generador de alertas
const express = require('express');
const samsara = require('../samsara');
const monitor = require('../monitor');
const { retardo, generarViajes } = require('../viajes');
const { listaUnidades } = require('./unidades');
const { pool, h, leerReglas, c } = require('./comun');

const router = express.Router();

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const diaMes = (f) => { const x = c.fechaLocal(f); return `${Number(x.slice(8))} ${MESES[Number(x.slice(5, 7)) - 1]}`; };

async function alertas(reglas, unidades, viajesHoy) {
  const hoy = c.hoyLocal();
  const out = [];
  const add = (lv, text, module, time, href) => out.push({ lv, text, module, time, href });

  for (const x of viajesHoy) {
    if (x.estado !== 'en_ruta') continue;
    const d = retardo(x);
    const omit = Number(x.omitidas);
    if (d > reglas.toleranciaRetardoMin || omit) {
      add(d > reglas.toleranciaRetardoMin ? 2 : 1,
        `${x.unidad} ${d > reglas.toleranciaRetardoMin ? `con ${d} min de retraso` : 'en ruta'}${omit ? ` y ${omit} ${omit === 1 ? 'omisión' : 'omisiones'}` : ''}`,
        `Recorrido · ${x.ruta}`, c.horaLocal(new Date()), `rutas/${x.id}`);
    }
  }

  const [llantas, cls, taller, rend, sinChk] = await Promise.all([
    pool.query(`SELECT n.unidad, COUNT(*) FILTER (WHERE n.mm < $1)::int cambiar,
                  MIN(n.psi) FILTER (WHERE n.psi < COALESCE(u.psi_objetivo,100) * 0.9) psi_baja, MAX(n.revisado) rev
                FROM neumaticos n JOIN unidades u ON u.unidad = n.unidad WHERE u.activo AND u.estado <> 'baja' GROUP BY n.unidad`, [reglas.neumaticoCambiarMm]),
    pool.query(`SELECT unidad, danos, veredicto, iniciado_en FROM checklists WHERE fecha=$1`, [hoy]),
    pool.query(`SELECT unidad, motivo, estado, ($1::date - ingreso) dias FROM taller WHERE estado <> 'Cerrado'`, [hoy]),
    pool.query(`SELECT r.unidad, SUM(distancia_km)/NULLIF(SUM(litros),0) kml, u.meta_kml::float meta
                FROM rendimiento_diario r JOIN unidades u ON u.unidad=r.unidad WHERE r.fecha >= $1 GROUP BY r.unidad, u.meta_kml`, [c.sumarDias(hoy, -7)]),
    Promise.resolve(null),
  ]);

  for (const t of llantas.rows) {
    if (t.cambiar) add(2, `${t.unidad} con ${t.cambiar} ${t.cambiar === 1 ? 'neumático' : 'neumáticos'} bajo ${reglas.neumaticoCambiarMm} mm`, 'Mantenimiento · neumáticos', diaMes(t.rev), 'mantenimiento');
    else if (t.psi_baja != null) add(1, `${t.unidad}: neumático a ${t.psi_baja} psi`, 'Mantenimiento · neumáticos', diaMes(t.rev), 'mantenimiento');
  }
  for (const k of cls.rows) {
    if (k.veredicto === 'no_apta') add(2, `${k.unidad} no apta para salir`, 'Checklist de salida', c.horaLocal(k.iniciado_en), `checklist/${k.unidad}`);
    for (const [, d] of Object.entries(k.danos || {})) {
      if (d.prev === 'Nuevo' && d.type !== 'Por describir') add(1, `${k.unidad}: ${String(d.type).toLowerCase()} reportado hoy`, 'Checklist de salida', c.horaLocal(k.iniciado_en), `checklist/${k.unidad}`);
    }
  }
  for (const t of taller.rows) {
    if (t.estado === 'Listo hoy') add(0, `${t.unidad} sale hoy del taller (${t.motivo.toLowerCase()})`, 'Mantenimiento · taller', 'hoy', 'mantenimiento');
    else if (t.dias >= 7) add(1, `${t.unidad} lleva ${t.dias} días en taller${t.estado === 'Esperando refacción' ? ' esperando refacción' : ''}`, 'Mantenimiento · taller', 'hoy', 'mantenimiento');
  }
  for (const r of rend.rows) {
    if (r.kml && r.meta && r.kml < r.meta * 0.9) add(1, `${r.unidad} rinde ${Math.round((1 - r.kml / r.meta) * 100)}% bajo su meta de km/L`, 'Combustible', '7 días', 'combustible');
  }
  for (const u of unidades) {
    if (u.st === 'baja') continue;
    if (u.odo != null && u.next != null && u.next - u.odo <= 0) add(1, `${u.id} tiene el servicio vencido por ${Math.round(u.odo - u.next).toLocaleString('es-MX')} km`, 'Unidades · servicio', 'hoy', 'unidades');
    if (u.poliza) {
      const dias = Math.round((new Date(u.poliza) - new Date(hoy)) / 86400000);
      if (dias < 0) add(2, `Póliza de seguro de ${u.id} vencida`, 'Unidades · documentos', 'hoy', 'unidades');
      else if (dias <= reglas.diasAvisoDocumentos) add(dias <= 15 ? 1 : 0, `Póliza de seguro de ${u.id} vence en ${dias} días`, 'Unidades · documentos', 'hoy', 'unidades');
    }
  }
  const lic = await pool.query('SELECT nombre, licencia_vence FROM choferes WHERE activo AND licencia_vence IS NOT NULL AND licencia_vence <= $1::date + $2::int', [hoy, reglas.diasAvisoDocumentos]);
  for (const l of lic.rows) {
    const dias = Math.round((new Date(l.licencia_vence) - new Date(hoy)) / 86400000);
    add(dias < 0 ? 2 : 0, dias < 0 ? `Licencia de ${l.nombre} vencida` : `Licencia de ${l.nombre} vence en ${dias} días`, 'Choferes · documentos', 'hoy', 'unidades');
  }
  void sinChk;
  return out.sort((a, b) => b.lv - a.lv);
}

router.get('/inicio', h(async (req, res) => {
  const hoy = c.hoyLocal();
  const ayer = c.sumarDias(hoy, -1);
  await generarViajes(pool, hoy);
  const reglas = await leerReglas(pool);
  const unidades = await listaUnidades();

  const viajesHoy = (await pool.query(
    `SELECT v.*, r.nombre ruta, r.cliente, r.sentido, ch.nombre chofer,
       (SELECT COUNT(*) FROM viaje_paradas p WHERE p.viaje_id=v.id AND p.estado='ok') hechas,
       (SELECT COUNT(*) FROM viaje_paradas p WHERE p.viaje_id=v.id) total,
       (SELECT COUNT(*) FROM viaje_paradas p WHERE p.viaje_id=v.id AND p.estado='omitida') omitidas
     FROM viajes v JOIN rutas r ON r.id=v.ruta_id LEFT JOIN choferes ch ON ch.id=v.chofer_id
     WHERE v.fecha=$1 ORDER BY v.salida_prog`, [hoy])).rows;

  // Puntualidad: últimos 5 días con viajes terminados
  const semana = (await pool.query(
    `SELECT v.*, v.fecha::text AS dia, r.sentido FROM viajes v JOIN rutas r ON r.id=v.ruta_id
     WHERE v.fecha BETWEEN $1 AND $2 AND v.estado='terminado'`, [c.sumarDias(hoy, -13), hoy])).rows;
  const porDia = new Map();
  for (const x of semana) {
    const d = porDia.get(x.dia) || { total: 0, ok: 0 };
    d.total++;
    if (retardo(x) <= reglas.toleranciaRetardoMin) d.ok++;
    porDia.set(x.dia, d);
  }
  const dias = [...porDia.keys()].sort().slice(-5);
  const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const week = dias.map((f) => ({ day: `${DIAS[c.diaSemana(f)]} ${Number(f.slice(8))}`, v: Math.round((porDia.get(f).ok / porDia.get(f).total) * 100) }));
  const ay = porDia.get(ayer);

  const activos = viajesHoy.filter((x) => x.estado === 'en_ruta');
  const ahora = new Date();
  const proximos = viajesHoy.filter((x) => x.estado === 'por_iniciar' && new Date(x.salida_prog) - ahora < 90 * 60000 && new Date(x.salida_prog) - ahora > -60 * 60000);
  const tardes = activos.filter((x) => retardo(x) > reglas.toleranciaRetardoMin);

  const live = [...activos, ...proximos].slice(0, 8).map((x) => ({
    id: x.id, unit: x.unidad || '—', route: `${x.ruta} · ${x.sentido === 'ENTRADA' ? 'entrada' : 'salida'}`, client: x.cliente,
    driver: x.chofer || 'Sin chofer', users: x.usuarios, done: Number(x.hechas), total: Number(x.total), miss: Number(x.omitidas),
    eta: c.horaLocal(x.estado === 'por_iniciar' ? x.salida_prog : x.eta || x.llegada_prog), delay: Math.max(0, retardo(x)),
    pending: x.estado === 'por_iniciar',
  }));

  const cuenta = (st) => unidades.filter((u) => u.st === st);
  const fleetParts = [
    ['ruta', 'En ruta'], ['iniciar', 'Por iniciar'], ['patio', 'Disponible en patio'], ['taller', 'En taller'], ['baja', 'Fuera de servicio'],
  ].map(([k, label]) => ({ key: k, label, units: cuenta(k).map((u) => u.id).join(', ') || '—', count: cuenta(k).length }));

  const operando = unidades.filter((u) => ['ruta', 'iniciar', 'patio'].includes(u.st));
  const cls = (await pool.query('SELECT unidad, veredicto, estado FROM checklists WHERE fecha=$1', [hoy])).rows;
  const clMap = new Map(cls.map((x) => [x.unidad, x]));
  const cuentaCl = (fn) => operando.filter((u) => fn(clMap.get(u.id))).length;
  const pendientesCl = operando.filter((u) => !clMap.get(u.id) || clMap.get(u.id).estado === 'borrador').map((u) => u.id);

  const rendBajo = unidades.filter((u) => u.kml != null && u.meta && u.kml < u.meta).length;
  const conRend = unidades.filter((u) => u.kml != null && u.meta).length;
  const listaAlertas = await alertas(reglas, unidades, viajesHoy);

  res.json({
    hoy, meta: reglas.metaPuntualidadPct, samsara: samsara.hayToken(), vivo: monitor.vivo.actualizado,
    kpis: {
      enRuta: activos.length, total: unidades.length, porIniciar: proximos.length, enPatio: cuenta('patio').length,
      usuarios: activos.reduce((a, x) => a + x.usuarios, 0),
      tarde: tardes.length, tardeTxt: tardes.length ? `${tardes[0].unidad} · +${retardo(tardes[0])} min` : 'Sin retrasos',
      puntualidadAyer: ay ? Math.round((ay.ok / ay.total) * 100) : null, tardesAyer: ay ? ay.total - ay.ok : 0, viajesAyer: ay ? ay.total : 0,
      disponibilidad: unidades.length ? Math.round((operando.length / unidades.length) * 100) : 0, operando: operando.length,
      rendBajo, conRend,
    },
    live,
    fleet: { total: unidades.length, parts: fleetParts },
    week,
    alerts: listaAlertas.slice(0, 12),
    alertCount: listaAlertas.length,
    critCount: listaAlertas.filter((a) => a.lv === 2).length,
    cl: {
      total: operando.length,
      done: operando.length - pendientesCl.length,
      parts: [
        { key: 'ok', label: 'Aptas', count: cuentaCl((k) => k && k.estado !== 'borrador' && k.veredicto === 'apta') },
        { key: 'obs', label: 'Con observaciones', count: cuentaCl((k) => k && k.estado !== 'borrador' && k.veredicto === 'observaciones') },
        { key: 'no', label: 'No aptas', count: cuentaCl((k) => k && k.estado !== 'borrador' && k.veredicto === 'no_apta') },
        { key: 'pend', label: 'Pendientes', count: pendientesCl.length },
      ],
      pendientes: pendientesCl.slice(0, 6),
    },
  });
}));

module.exports = router;

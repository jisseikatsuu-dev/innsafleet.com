/* Combustible · rendimiento por unidad */
(() => {
  'use strict';
  const { el, api, fmt, signo, dinero, aviso, COLOR, modal, cerrarModal, formulario, icono, segmentado, conBoton, descargar, fechaDM, fechaCorta, estado } = CP;
  let cliente = 'Todos';
  let sel = null;
  let orden = 'asc';
  let desde = null;
  let hasta = null;

  async function mostrar(cont) {
    const hoy = estado.yo.hoy;
    desde = desde || hoy.slice(0, 8) + '01';
    hasta = hasta || hoy;
    const q = `desde=${desde}&hasta=${hasta}&cliente=${encodeURIComponent(cliente === 'Todos' ? '' : cliente)}`;
    const [d, rep] = await Promise.all([api('GET', `/api/combustible?${q}`), api('GET', '/api/reportes')]);
    const clientes = ['Todos', ...rep.clientes];

    const rows = d.unidades.slice().sort((a, b) => {
      const ra = a.ratio ?? (orden === 'asc' ? 9 : -9);
      const rb = b.ratio ?? (orden === 'asc' ? 9 : -9);
      return orden === 'asc' ? ra - rb : rb - ra;
    });
    if (!rows.some((u) => u.id === sel)) sel = rows[0]?.id || null;

    const periodo = `Periodo ${fechaDM(desde)} – ${fechaCorta(hasta)}`;
    const selDesde = el('input', { type: 'date', class: 'inp', value: desde, max: hoy, 'aria-label': 'Desde', onchange: (e) => { desde = e.target.value || desde; mostrar(cont); } });
    const selHasta = el('input', { type: 'date', class: 'inp', value: hasta, max: hoy, 'aria-label': 'Hasta', onchange: (e) => { hasta = e.target.value || hasta; mostrar(cont); } });

    const cab = el('div', { class: 'cabecera' },
      el('div', { class: 'tit' }, el('h1', { text: 'Rendimiento de combustible' }), el('div', { class: 'sub', text: `${periodo} · km/L por unidad contra su meta` })),
      el('div', { class: 'acciones-cab' }, selDesde, selHasta,
        segmentado(clientes, cliente, (c) => { cliente = c; mostrar(cont); }, { etiqueta: 'Filtrar por cliente' }),
        estado.yo.samsara ? el('button', { type: 'button', class: 'btn-borde solo-admin', text: 'Traer datos de Samsara', onclick: (e) => conBoton(e.currentTarget, async () => {
          await api('POST', '/api/samsara/sync-vehiculos');
          const r = await api('POST', '/api/samsara/sync-reporte', { desde: desde < CP.sumarDias(hasta, -30) ? CP.sumarDias(hasta, -30) : desde, hasta });
          aviso(`Listo: ${r.dias ?? ''} días, ${r.filas ?? r.registros ?? 0} registros.`); mostrar(cont);
        }) }) : null));

    const k = d.kpi;
    const kpis = el('section', { class: 'kpis', 'aria-label': 'Resumen' },
      CP.kpi({ et: 'Rendimiento de la flota', valor: fmt(k.kmL, 2), unidad: 'km/L', pie: 'Promedio ponderado por km' }),
      CP.kpi({ et: 'Litros consumidos', valor: fmt(k.liters), unidad: 'L', pie: `${k.units} unidades en el filtro` }),
      CP.kpi({ et: 'Kilómetros recorridos', valor: fmt(k.km), unidad: 'km', pie: 'GPS Samsara' }),
      CP.kpi({ et: 'Costo por km', valor: k.costKm != null ? dinero(k.costKm, 2) : '—', unidad: 'MXN',
        pie: el('span', {}, 'Total ', el('span', { class: 'num', text: dinero(k.cost) }), ' · diésel a ', el('span', { class: 'num', text: d.precio ? dinero(d.precio, 2) : 'sin precio' }), '/L') }),
      CP.kpi({ et: 'Unidades bajo meta', valor: k.under, unidad: `de ${k.units}`, pie: 'Revisar ralentí y estilo de manejo', alerta: true }));

    const COLS = '128px 96px 76px 76px 72px minmax(0,1fr) 100px 64px';
    const filas = rows.map((u) => {
      const ok = u.ratio == null || u.ratio >= 1;
      const color = u.ratio == null ? COLOR.gris2 : ok ? COLOR.acento : COLOR.warn;
      const vals = u.w.filter((x) => x != null);
      const mn = vals.length ? Math.min(...vals) : 0;
      const mx = vals.length ? Math.max(...vals) : 1;
      const span = mx - mn || 1;
      return el('button', { type: 'button', class: 'tr', 'aria-pressed': String(u.id === sel), style: { 'grid-template-columns': COLS }, onclick: () => { sel = u.id; mostrar(cont); } },
        el('div', { class: 'dos-lineas', style: { gap: '2px' } }, el('span', { style: { 'font-weight': 700, 'font-size': '15px' }, text: u.id }), el('span', { class: 'l2', text: u.type })),
        el('div', { style: { color: COLOR.tinta2 }, text: u.client || '—' }),
        el('div', { class: 'num', style: { 'text-align': 'right' }, text: fmt(u.km) }),
        el('div', { class: 'num', style: { 'text-align': 'right' }, text: fmt(u.l) }),
        el('div', { class: 'num', style: { 'text-align': 'right', 'font-weight': 600, 'font-size': '15px', color }, text: u.kml != null ? fmt(u.kml, 2) : '—' }),
        el('div', { style: { display: 'flex', 'align-items': 'center', gap: '10px' } },
          el('div', { style: { position: 'relative', 'flex-grow': 1, height: '8px', background: COLOR.borde2, 'border-radius': '4px' } },
            el('div', { style: { position: 'absolute', left: 0, top: 0, bottom: 0, 'border-radius': '4px', width: `${u.ratio != null ? Math.min(u.ratio / 1.25, 1) * 100 : 0}%`, background: color } }),
            el('div', { style: { position: 'absolute', left: '80%', top: '-4px', width: '2px', height: '16px', background: COLOR.tinta } })),
          el('span', { class: 'num', style: { width: '52px', 'text-align': 'right', 'font-size': '12px', 'font-weight': 600, color }, text: u.ratio != null ? signo((u.ratio - 1) * 100) : '—' })),
        el('div', { 'aria-hidden': 'true', style: { display: 'flex', 'align-items': 'flex-end', gap: '3px', height: '26px' } },
          u.w.map((v, i) => el('div', { style: { width: '8px', 'border-radius': '2px', height: `${v == null ? 3 : Math.round(6 + ((v - mn) / span) * 20)}px`, background: i === u.w.length - 1 && v != null ? color : COLOR.claro } }))),
        el('div', { class: 'num', style: { 'text-align': 'right', color: u.idle > d.ralentiAlerta ? COLOR.warn : COLOR.tinta2 }, text: u.idle != null ? `${u.idle}%` : '—' }));
    });

    const tabla = el('section', { class: 'tarjeta oculto', 'aria-label': 'Unidades' },
      el('div', { class: 't-enc', style: { padding: '18px 24px' } }, el('h2', { text: 'Unidades' }),
        el('button', { type: 'button', class: 'btn-borde', onclick: () => { orden = orden === 'asc' ? 'desc' : 'asc'; mostrar(cont); } }, icono('orden'), orden === 'asc' ? 'Peor rendimiento primero' : 'Mejor rendimiento primero')),
      el('div', { class: 'th', style: { 'grid-template-columns': COLS } },
        el('div', { text: 'Unidad' }), el('div', { text: 'Cliente' }), el('div', { style: { 'text-align': 'right' }, text: 'Km' }), el('div', { style: { 'text-align': 'right' }, text: 'Litros' }),
        el('div', { style: { 'text-align': 'right' }, text: 'km/L' }), el('div', { text: 'Contra meta' }), el('div', { text: '8 semanas' }), el('div', { style: { 'text-align': 'right' }, text: 'Ralentí' })),
      el('div', { class: 'lista-scroll' }, filas.length ? filas : el('div', { class: 'vacio', text: 'Sin unidades para este cliente.' })),
      el('div', { class: 'leyenda', style: { 'margin-top': 'auto', padding: '12px 24px', 'border-top': `1px solid ${COLOR.borde2}`, gap: '20px' } },
        el('span', {}, el('span', { style: { width: '2px', height: '12px', background: COLOR.tinta } }), 'Meta de la unidad'),
        el('span', {}, el('span', { class: 'cuadro', style: { background: COLOR.acento } }), 'En meta o arriba'),
        el('span', {}, el('span', { class: 'cuadro', style: { background: COLOR.warn } }), 'Bajo meta'),
        el('span', { text: `Ralentí en naranja: más de ${d.ralentiAlerta}% del tiempo encendido` })));

    const s = rows.find((u) => u.id === sel);
    const detalle = s ? pintarDetalle(s, d, cont, q) : el('aside', { class: 'tarjeta vacio', text: 'Sin datos.' });
    cont.replaceChildren(cab, kpis, el('div', { class: 'rejilla', style: { 'flex-grow': 1 } }, tabla, detalle));
  }

  function pintarDetalle(s, d, cont, q) {
    const ok = s.ratio == null || s.ratio >= 1;
    const color = s.ratio == null ? COLOR.gris2 : ok ? COLOR.acento : COLOR.warn;
    const vals = s.w.filter((x) => x != null);
    const top = Math.max(...vals, s.meta || 0, 0.1) * 1.12;
    const H = 150;
    const primeros = s.w.findIndex((x) => x != null);
    const trend = vals.length >= 2 ? (vals[vals.length - 1] / s.w[primeros] - 1) * 100 : null;
    const metaY = s.meta ? Math.round((s.meta / top) * H) : null;

    const grafica = el('div', { style: { position: 'relative', height: '170px', 'border-bottom': `1px solid ${COLOR.control}` } },
      metaY != null ? el('div', { style: { position: 'absolute', left: 0, right: 0, bottom: metaY + 'px', 'border-top': `2px dashed ${COLOR.tinta}` } }) : null,
      metaY != null ? el('div', { class: 'num', style: { position: 'absolute', right: 0, bottom: metaY + 4 + 'px', 'font-size': '11px', 'font-weight': 600, background: '#fff', padding: '0 4px' }, text: `meta ${fmt(s.meta, 1)}` }) : null,
      el('div', { style: { position: 'absolute', inset: 0, display: 'grid', 'grid-template-columns': 'repeat(8, minmax(0,1fr))', gap: '10px', 'align-items': 'end' } },
        s.w.map((v) => el('div', { style: { display: 'flex', 'flex-direction': 'column', 'align-items': 'center', gap: '4px' } },
          el('span', { class: 'num', style: { 'font-size': '10px', color: COLOR.gris }, text: v != null ? fmt(v, 2) : '—' }),
          el('div', { style: { width: '100%', 'border-radius': '4px 4px 0 0', height: `${v != null ? Math.round((v / top) * H) : 2}px`, background: v == null ? COLOR.borde2 : !s.meta || v >= s.meta ? COLOR.acento : COLOR.warn } })))));

    const caja = (et, val, col) => el('div', { class: 'caja' }, el('div', { class: 'mini', text: et }), el('div', { class: 'num', style: { 'font-size': '20px', 'font-weight': 600, color: col || COLOR.tinta }, text: val }));

    return el('aside', { class: 'tarjeta', style: { padding: '24px', gap: '22px' }, 'aria-label': 'Detalle de unidad' },
      el('div', { style: { display: 'flex', 'justify-content': 'space-between', 'align-items': 'flex-start', gap: '10px' } },
        el('div', { class: 'dos-lineas', style: { gap: '4px' } }, el('div', { class: 'eyebrow', text: 'Detalle' }), el('h2', { style: { 'font-size': '28px', 'font-weight': 700 }, text: s.id }),
          el('div', { class: 'sub', style: { 'font-size': '13px' }, text: `${s.type} · ${s.client || '—'} · ${s.route}` })),
        el('span', { class: `pill ${s.ratio == null ? 'gris' : ok ? 'ok' : 'mal'}`, style: { padding: '6px 12px' }, text: s.ratio == null ? 'Sin datos' : ok ? 'En meta' : 'Bajo meta' })),
      el('div', { style: { display: 'flex', 'align-items': 'flex-end', gap: '28px', 'flex-wrap': 'wrap' } },
        el('div', { class: 'dos-lineas', style: { gap: '2px' } },
          el('div', { style: { display: 'flex', 'align-items': 'baseline', gap: '6px' } }, el('span', { class: 'num', style: { 'font-size': '44px', 'font-weight': 600, color }, text: s.kml != null ? fmt(s.kml, 2) : '—' }), el('span', { class: 'sub', style: { 'font-size': '15px' }, text: 'km/L' })),
          el('div', { class: 'sub', style: { 'font-size': '13px' } }, 'Meta ', el('span', { class: 'num', text: s.meta ? fmt(s.meta, 1) : '—' }), ' km/L · ', el('span', { class: 'num', style: { color, 'font-weight': 600 }, text: s.ratio != null ? signo((s.ratio - 1) * 100) + ' vs meta' : 'sin datos' }))),
        el('div', { class: 'dos-lineas', style: { gap: '2px', 'padding-bottom': '4px' } }, el('div', { class: 'sub', style: { 'font-size': '13px' }, text: 'Tendencia 8 sem.' }),
          el('div', { class: 'num', style: { 'font-size': '18px', 'font-weight': 600, color: trend == null ? COLOR.gris2 : trend >= 0 ? COLOR.acento : COLOR.warn }, text: trend != null ? signo(trend) : '—' }))),
      el('div', { style: { display: 'flex', 'flex-direction': 'column', gap: '10px' } },
        el('div', { style: { 'font-size': '13px', 'font-weight': 600 }, text: 'km/L por semana' }), grafica,
        el('div', { style: { display: 'grid', 'grid-template-columns': 'repeat(8, minmax(0,1fr))', gap: '10px' } }, d.semanas.map((w) => el('div', { style: { 'text-align': 'center', 'font-size': '11px', color: COLOR.gris }, text: w })))),
      el('div', { style: { display: 'grid', 'grid-template-columns': 'repeat(2, minmax(0,1fr))', gap: '12px' } },
        caja('Ralentí', s.idle != null ? `${s.idle}%` : '—', s.idle > d.ralentiAlerta ? COLOR.warn : null),
        caja('Excesos de velocidad', String(s.speed)),
        caja('Cargas de combustible', String(s.loads)),
        caja('Costo del periodo', dinero(s.cost))),
      !s.vinculada ? el('div', { class: 'nota', style: { background: COLOR.borde2, color: COLOR.tinta2 }, text: 'Esta unidad no está vinculada con Samsara: sin km ni litros automáticos.' }) : null,
      el('div', { style: { 'margin-top': 'auto', display: 'flex', gap: '10px' } },
        el('button', { type: 'button', class: 'btn m', style: { 'flex-grow': 1 }, text: `Ver cargas de ${s.id}`, onclick: () => verCargas(s.id, cont) }),
        el('button', { type: 'button', class: 'btn m sec', text: 'Exportar', onclick: () => descargar(`/api/combustible/exportar.csv?${q}`) })));
  }

  async function verCargas(unidad, cont) {
    const cargas = await api('GET', `/api/cargas?unidad=${encodeURIComponent(unidad)}`);
    const tabla = cargas.length ? el('table', { class: 'tabla-simple' },
      el('thead', {}, el('tr', {}, ['Fecha', 'Litros', 'Odómetro', 'Precio/L', 'Lleno', 'Estación', 'Capturó', ''].map((t) => el('th', { text: t })))),
      el('tbody', {}, cargas.map((c) => el('tr', {},
        el('td', { class: 'num', text: new Date(c.fecha_hora).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) }),
        el('td', { class: 'num', text: fmt(c.litros, 1) }), el('td', { class: 'num', text: c.odometro_km != null ? fmt(c.odometro_km) : '—' }),
        el('td', { class: 'num', text: c.precio_litro != null ? dinero(c.precio_litro, 2) : '—' }), el('td', { text: c.tanque_lleno ? 'Sí' : 'No' }),
        el('td', { text: c.estacion || '—' }), el('td', { text: c.capturado_por }),
        el('td', {}, el('button', { type: 'button', class: 'enlace solo-admin', style: { color: COLOR.warnTxt }, text: 'Borrar', onclick: async () => {
          if (!confirm('¿Borrar esta carga?')) return;
          try { await api('DELETE', `/api/cargas/${c.id}`); aviso('Carga borrada.'); verCargas(unidad, cont); mostrar(cont); } catch (e) { aviso(e.message, true); }
        } }))))))
      : el('div', { class: 'vacio', text: 'Sin cargas registradas.' });

    const ahora = new Date();
    const local = new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const f = formulario([
      [{ name: 'fechaHora', label: 'Fecha y hora', type: 'datetime-local', value: local, required: true },
       { name: 'litros', label: 'Litros', type: 'number', step: 0.01, min: 0.1, required: true }],
      [{ name: 'odometroKm', label: 'Odómetro (km)', type: 'number', step: 0.1, min: 0 },
       { name: 'precioLitro', label: 'Precio por litro', type: 'number', step: 0.01, min: 0, value: estado.yo.reglas.precioDieselLitro || '' }],
      [{ name: 'estacion', label: 'Estación', maxlength: 80 }, { name: 'tanqueLleno', label: 'Tanque lleno', type: 'checkbox', value: true }],
    ], {
      texto: 'Registrar carga',
      enviar: async (d) => {
        const body = { ...d, unidad, fechaHora: new Date(d.fechaHora).toISOString() };
        for (const k of ['odometroKm', 'precioLitro']) if (body[k] === '') body[k] = null;
        await api('POST', '/api/cargas', body);
        aviso('Carga registrada.'); verCargas(unidad, cont); mostrar(cont);
      },
    });
    modal(`Cargas de ${unidad}`, el('div', { style: { display: 'flex', 'flex-direction': 'column', gap: '16px' } },
      tabla, el('div', { class: 'solo-admin', style: { display: 'flex', 'flex-direction': 'column', gap: '8px' } }, el('strong', { text: 'Nueva carga' }), f)), { ancho: true });
  }

  CP.vistas.combustible = { mostrar };
})();

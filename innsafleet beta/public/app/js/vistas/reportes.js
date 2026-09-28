/* Reportes · Reporte de cliente */
(() => {
  'use strict';
  const { el, api, fmt, COLOR, icono, segmentado, descargar, fechaLarga, iniciales, estado } = CP;
  let cliente = 'Todos';
  let fecha = null;
  let soloRetardos = false;

  async function mostrar(cont) {
    fecha = fecha || CP.sumarDias(estado.yo.hoy, -1);
    const q = `fecha=${fecha}&cliente=${encodeURIComponent(cliente === 'Todos' ? '' : cliente)}`;
    const d = await api('GET', `/api/reportes?${q}`);
    const tol = d.tol;
    const clientes = ['Todos', ...d.clientes];

    const trips = d.viajes.map((t) => ({ ...t, late: t.delay > tol }));
    const rows = trips.filter((t) => !soloRetardos || t.late);

    let riders = 0, cap = 0, late = 0, lateRiders = 0, lateMins = 0, maxLate = 0;
    const units = new Set(), drivers = new Set();
    for (const t of trips) {
      riders += t.riders; cap += t.cap; units.add(t.unit); drivers.add(t.driver);
      if (t.late) { late++; lateRiders += t.riders; lateMins += t.delay; maxLate = Math.max(maxLate, t.delay); }
    }
    const n = trips.length;
    const onTime = n ? Math.round(((n - late) / n) * 100) : 0;

    const selFecha = el('input', { type: 'date', class: 'inp', value: fecha, max: estado.yo.hoy, 'aria-label': 'Fecha del reporte', onchange: (e) => { fecha = e.target.value || fecha; mostrar(cont); } });
    const cab = el('div', { class: 'cabecera' },
      el('div', { class: 'tit' },
        el('h1', { text: `Reporte de cliente · ${cliente === 'Todos' ? 'Todos los clientes' : cliente}` }),
        el('div', { class: 'sub', text: `${fechaLarga(d.fecha)} · 3 turnos · retardo = ${'más de ' + tol} min tarde (entrada: llegada a planta · salida: salida de planta)` })),
      el('div', { class: 'acciones-cab' }, selFecha,
        segmentado(clientes, cliente, (c) => { cliente = c; mostrar(cont); }, { etiqueta: 'Filtrar por cliente' }),
        el('button', { type: 'button', class: 'btn', onclick: () => descargar(`/api/reportes/descargar.csv?${q}`) }, icono('descarga'), 'Descargar reporte')));

    const kpis = el('section', { class: 'kpis', 'aria-label': 'Resumen' },
      CP.kpi({ et: 'Viajes realizados', valor: n, pie: `${units.size} unidades · ${drivers.size} choferes` }),
      CP.kpi({ et: 'Usuarios transportados', valor: fmt(riders), pie: el('span', {}, 'Ocupación ', el('span', { class: 'num', text: `${cap ? Math.round((riders / cap) * 100) : 0}%` }), ` de ${fmt(cap)} lugares`) }),
      CP.kpi({ et: 'Puntualidad', valor: onTime, unidad: '%', pie: `${n - late} viajes a tiempo`, color: COLOR.acento }),
      CP.kpi({ et: 'Viajes con retardo', valor: late, pie: `${fmt(lateRiders)} usuarios llegaron tarde`, alerta: true }),
      CP.kpi({ et: 'Retardo promedio', valor: late ? (lateMins / late).toFixed(1) : '0', unidad: 'min', pie: el('span', {}, 'Máximo ', el('span', { class: 'num', text: maxLate }), ' min') }));

    const COLS = '56px minmax(140px,1.1fr) 70px minmax(120px,1fr) 128px 62px 62px 84px';
    const tabla = el('section', { class: 'tarjeta oculto', 'aria-label': 'Viajes del día' },
      el('div', { class: 't-enc' }, el('h2', { text: 'Viajes del día' }),
        el('button', { type: 'button', class: 'btn-borde', 'aria-pressed': String(soloRetardos), onclick: () => { soloRetardos = !soloRetardos; mostrar(cont); } }, icono('reloj'), 'Solo retardos')),
      el('div', { class: 'th', style: { 'grid-template-columns': COLS, padding: '11px 24px' } },
        ['Salida', 'Ruta · turno', 'Unidad', 'Chofer', 'Usuarios'].map((t) => el('div', { text: t })),
        el('div', { style: { 'text-align': 'right' }, text: 'Hora prog.' }), el('div', { style: { 'text-align': 'right' }, text: 'Hora real' }), el('div', { style: { 'text-align': 'right' }, text: 'Retardo' })),
      el('div', { class: 'lista-scroll' }, rows.length ? rows.map((r) => {
        const occ = r.cap ? Math.round((r.riders / r.cap) * 100) : 0;
        const pill = r.late ? `+${r.delay} min` : r.delay > 0 ? `+${r.delay} min` : 'A tiempo';
        return el('div', { class: 'tr', style: { 'grid-template-columns': COLS, 'min-height': '47px', background: r.late ? '#FFFBF8' : '#fff' } },
          el('div', { class: 'num', style: { 'font-weight': 600 }, text: r.time }),
          el('div', { class: 'dos-lineas' }, el('span', { class: 'recorte', style: { 'font-weight': 500 }, text: r.route }), el('span', { class: 'l2', text: `${r.shift} · ${r.client}${r.enCurso ? ' · en curso' : ''}` })),
          el('div', {}, el('span', { class: 'etq-u', text: r.unit })),
          el('div', { style: { display: 'flex', 'align-items': 'center', gap: '10px', 'min-width': 0 } },
            el('span', { 'aria-hidden': 'true', style: { width: '30px', height: '30px', 'flex-shrink': 0, 'border-radius': '50%', background: '#E6E4DE', color: COLOR.tinta2, display: 'flex', 'align-items': 'center', 'justify-content': 'center', 'font-size': '11px', 'font-weight': 700 }, text: iniciales(r.driver) }),
            el('span', { class: 'recorte', text: r.driver })),
          el('div', { style: { display: 'flex', 'align-items': 'center', gap: '10px' } },
            el('span', { class: 'num', style: { width: '52px', 'font-weight': 600 } }, String(r.riders), el('span', { style: { color: COLOR.gris2, 'font-weight': 400 }, text: `/${r.cap || '—'}` })),
            el('div', { class: 'barra', style: { 'flex-grow': 1 } }, el('span', { style: { width: occ + '%', background: '#7C9BA3' } }))),
          el('div', { class: 'num', style: { 'text-align': 'right', color: COLOR.gris }, text: r.eta }),
          el('div', { class: 'num', style: { 'text-align': 'right', 'font-weight': 600, color: r.late ? COLOR.warnTxt : COLOR.tinta }, text: r.real || '—' }),
          el('div', { style: { display: 'flex', 'justify-content': 'flex-end' } }, el('span', { class: `pill num ${r.late ? 'mal' : 'ok'}`, text: pill })));
      }) : el('div', { class: 'vacio', text: n ? 'Sin retardos en este filtro.' : 'Sin viajes realizados en esta fecha.' })));

    // Retardos por chofer
    const agg = new Map();
    for (const t of trips.filter((x) => x.late)) {
      const a = agg.get(t.driver) || { driver: t.driver, mins: 0, count: 0, units: new Set() };
      a.mins += t.delay; a.count++; a.units.add(t.unit);
      agg.set(t.driver, a);
    }
    const lista = [...agg.values()].sort((a, b) => b.mins - a.mins);
    const topM = lista[0]?.mins || 1;
    const porChofer = el('section', { class: 'tarjeta pad', style: { padding: '22px 24px' }, 'aria-label': 'Retardos por chofer' },
      el('div', { class: 't-fila' }, el('h2', { text: 'Retardos por chofer' }), el('span', { class: 'mini', text: 'min acumulados' })),
      lista.length ? lista.map((a) => el('div', { style: { display: 'flex', 'flex-direction': 'column', gap: '6px' } },
        el('div', { style: { display: 'flex', 'justify-content': 'space-between', 'font-size': '14px', gap: '8px' } },
          el('span', {}, el('span', { style: { 'font-weight': 600 }, text: a.driver }), el('span', { style: { color: COLOR.gris }, text: ` · ${[...a.units].join(', ')}` })),
          el('span', { class: 'num', style: { 'font-weight': 600, color: COLOR.warnTxt, 'white-space': 'nowrap' }, text: `${a.mins} min` })),
        el('div', { style: { display: 'flex', 'align-items': 'center', gap: '10px' } },
          el('div', { style: { 'flex-grow': 1, height: '8px', background: '#F3EFEA', 'border-radius': '4px', overflow: 'hidden' } }, el('div', { style: { height: '100%', width: `${Math.round((a.mins / topM) * 100)}%`, background: COLOR.warn, 'border-radius': '4px' } })),
          el('span', { style: { width: '70px', 'text-align': 'right', 'font-size': '12px', color: COLOR.gris }, text: `${a.count} ${a.count === 1 ? 'retardo' : 'retardos'}` }))))
        : el('div', { style: { padding: '18px', 'border-radius': '12px', background: '#EEF4F5', color: COLOR.acentoOsc, 'font-size': '14px', 'font-weight': 500 }, text: 'Sin retardos para este cliente.' }));

    // Usuarios por turno
    const turnos = ['1er turno', '2do turno', '3er turno'].map((name) => {
      const s = trips.filter((t) => t.shift === name);
      let r = 0, c = 0, lr = 0;
      for (const t of s) { r += t.riders; c += t.cap; if (t.late) lr += t.riders; }
      return { name, trips: s.length, riders: r, cap: c, occ: c ? Math.round((r / c) * 100) : 0, lr, onW: c ? ((r - lr) / c) * 100 : 0, lateW: c ? (lr / c) * 100 : 0 };
    });
    const porTurno = el('section', { class: 'tarjeta pad', style: { padding: '22px 24px', gap: '16px', 'flex-grow': 1 }, 'aria-label': 'Usuarios por turno' },
      el('div', { class: 't-fila' }, el('h2', { text: 'Usuarios por turno' }), el('span', { class: 'mini', text: 'abordados / capacidad' })),
      turnos.map((s) => el('div', { style: { display: 'flex', 'flex-direction': 'column', gap: '8px' } },
        el('div', { class: 't-fila' },
          el('span', { style: { 'font-size': '14px', 'font-weight': 600 } }, s.name, el('span', { style: { 'font-weight': 400, color: COLOR.gris }, text: ` · ${s.trips} viajes` })),
          el('span', { class: 'num', style: { 'font-size': '18px', 'font-weight': 600 } }, String(s.riders), el('span', { style: { 'font-size': '13px', color: COLOR.gris2, 'font-weight': 400 }, text: ` / ${s.cap}` }))),
        el('div', { style: { height: '14px', background: COLOR.borde2, 'border-radius': '4px', overflow: 'hidden', display: 'flex' } },
          el('div', { style: { height: '100%', width: s.onW + '%', background: COLOR.acento } }), el('div', { style: { height: '100%', width: s.lateW + '%', background: COLOR.warn } })),
        el('div', { class: 'mini' }, el('span', { class: 'num', text: `${s.occ}%` }), ' ocupación · ', el('span', { class: 'num', text: s.lr }), ' con retardo'))),
      el('div', { class: 'leyenda', style: { 'margin-top': 'auto' } },
        el('span', {}, el('span', { class: 'cuadro', style: { background: COLOR.acento } }), 'Llegaron a tiempo'),
        el('span', {}, el('span', { class: 'cuadro', style: { background: COLOR.warn } }), 'Llegaron tarde')));

    cont.replaceChildren(cab, kpis, el('div', { class: 'rejilla', style: { 'grid-template-columns': 'minmax(0,1fr) 400px', 'flex-grow': 1 } }, tabla, el('aside', { class: 'col', style: { gap: '24px' } }, porChofer, porTurno)));
  }

  CP.vistas.reportes = { mostrar };
})();

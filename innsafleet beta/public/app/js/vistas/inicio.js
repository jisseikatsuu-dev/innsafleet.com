/* Inicio · Panel general */
(() => {
  'use strict';
  const { el, api, fmt, kpi, COLOR, horaAhora, fechaLarga } = CP;
  let timer = null;

  async function mostrar(cont) {
    const d = await api('GET', '/api/inicio');
    const k = d.kpis;

    const vivoTxt = el('span', { class: 'num', text: horaAhora() });
    const cab = el('div', { class: 'cabecera' },
      el('div', { class: 'tit' },
        el('h1', { text: 'Panel general' }),
        el('div', { class: 'sub', text: `${fechaLarga(d.hoy)} · operación del día` })),
      el('span', { class: 'pill ok', style: { 'font-size': '13px', padding: '6px 12px' } },
        el('span', { class: 'p', style: { width: '8px', height: '8px', background: d.samsara ? COLOR.acento : COLOR.gris2 } }),
        d.samsara ? 'En vivo · ' : 'Sin GPS · ', vivoTxt));

    const kpis = el('section', { class: 'kpis seis', 'aria-label': 'Resumen' },
      kpi({ et: 'Unidades en ruta', valor: k.enRuta, unidad: `de ${k.total}`, pie: `${k.porIniciar} por iniciar · ${k.enPatio} en patio`, href: '#/rutas', color: COLOR.acento }),
      kpi({ et: 'Usuarios a bordo', valor: k.usuarios, pie: `en ${k.enRuta} viajes activos`, href: '#/rutas' }),
      kpi({ et: 'Viajes con retraso', valor: k.tarde, unidad: 'ahora', pie: k.tardeTxt, href: '#/rutas', alerta: k.tarde > 0 }),
      kpi({ et: 'Puntualidad ayer', valor: k.puntualidadAyer ?? '—', unidad: k.puntualidadAyer != null ? '%' : '',
            pie: k.viajesAyer ? `${k.tardesAyer} de ${k.viajesAyer} viajes con retardo` : 'Sin viajes cerrados ayer', href: '#/reportes',
            color: k.puntualidadAyer != null && k.puntualidadAyer < d.meta ? COLOR.warnTxt : null }),
      kpi({ et: 'Disponibilidad', valor: k.disponibilidad, unidad: '%', pie: `${k.operando} de ${k.total} unidades`, href: '#/mantenimiento' }),
      kpi({ et: 'Rendimiento', valor: k.conRend ? `${k.rendBajo} de ${k.conRend}` : '—', pie: 'unidades bajo meta de km/L', href: '#/combustible' }));

    // --- Operación en vivo ---
    const COLS = '70px minmax(0,1fr) 150px 190px 64px 104px';
    const filasVivo = d.live.length ? d.live.map((t) => {
      const late = t.delay > CP.estado.yo.reglas.toleranciaRetardoMin;
      const pct = t.total ? Math.round((t.done / t.total) * 100) : 0;
      const pill = t.pending ? ['Por iniciar', 'gris'] : late ? [`+${t.delay} min`, 'mal'] : ['A tiempo', 'ok'];
      const barra = el('span', { style: { width: pct + '%', background: late ? COLOR.warn : COLOR.acento } });
      return el('a', { class: 'tr', href: `#/rutas/${t.id}`, style: { 'grid-template-columns': COLS, gap: '14px', 'min-height': '56px' } },
        el('span', {}, el('span', { class: 'etq-u', text: t.unit })),
        el('span', { class: 'dos-lineas' }, el('span', { style: { 'font-weight': 600 }, text: t.route }), el('span', { class: 'l2', text: `${t.client} · ${t.users} usuarios a bordo` })),
        el('span', { class: 'recorte', style: { 'font-size': '13px', color: COLOR.tinta2 }, text: t.driver }),
        el('span', { style: { display: 'flex', 'flex-direction': 'column', gap: '5px' } },
          el('span', { class: 'mini' }, 'Paradas ', el('span', { class: 'num', style: { color: COLOR.tinta, 'font-weight': 600 }, text: `${t.done}/${t.total}` }),
            t.miss ? el('span', { style: { color: COLOR.warnTxt, 'font-weight': 600 }, text: ` · ${t.miss} ${t.miss === 1 ? 'omisión' : 'omisiones'}` }) : null),
          el('span', { class: 'barra' }, barra)),
        el('span', { class: 'dos-lineas', style: { 'text-align': 'right' } }, el('span', { style: { 'font-size': '11px', color: COLOR.gris }, text: t.pending ? 'Sale' : 'Llega' }), el('span', { class: 'num', style: { 'font-weight': 600 }, text: t.eta })),
        el('span', { class: `pill ${pill[1]}`, style: { 'justify-self': 'end' }, text: pill[0] }));
    }) : [el('div', { class: 'vacio', text: 'No hay viajes en ruta ni por salir en la próxima hora y media.' })];

    const vivo = el('section', { class: 'tarjeta oculto', 'aria-label': 'Operación en vivo' },
      el('div', { class: 't-enc' }, el('h2', { text: 'Operación en vivo' }), el('a', { class: 'enlace', href: '#/rutas', text: 'Ver mapa de rutas' })),
      filasVivo);

    // --- Estado de la flota ---
    const colorFlota = { ruta: COLOR.acento, iniciar: '#7C9BA3', patio: '#C9D9DC', taller: COLOR.watch, baja: COLOR.warn };
    const flota = el('section', { class: 'tarjeta pad', 'aria-label': 'Estado de la flota' },
      el('div', { class: 't-fila' }, el('h2', { text: 'Estado de la flota' }), el('a', { class: 'enlace', href: '#/unidades', text: 'Ver unidades' })),
      el('div', { style: { display: 'flex', 'align-items': 'baseline', gap: '8px' } }, el('span', { class: 'num', style: { 'font-size': '34px', 'font-weight': 600 }, text: d.fleet.total }), el('span', { class: 'sub', text: 'unidades' })),
      el('div', { style: { display: 'flex', height: '18px', 'border-radius': '5px', overflow: 'hidden', gap: '2px' } },
        d.fleet.parts.filter((p) => p.count).map((p) => el('div', { style: { height: '100%', 'flex-grow': p.count, background: colorFlota[p.key] } }))),
      el('div', { style: { display: 'flex', 'flex-direction': 'column', gap: '8px' } },
        d.fleet.parts.map((p) => el('div', { style: { display: 'grid', 'grid-template-columns': '12px minmax(0,1fr) 28px', gap: '10px', 'align-items': 'center', 'font-size': '13px' } },
          el('span', { class: 'cuadro', style: { width: '12px', height: '12px', 'border-radius': '3px', background: colorFlota[p.key] } }),
          el('span', { class: 'recorte' }, p.label, el('span', { style: { color: COLOR.gris }, text: ` · ${p.units}` })),
          el('span', { class: 'num', style: { 'text-align': 'right', 'font-weight': 600 }, text: p.count })))));

    // --- Puntualidad de la semana ---
    const meta = d.meta;
    const graf = el('div', { style: { position: 'relative', 'flex-grow': 1, 'min-height': '190px', 'margin-top': '18px', 'border-bottom': `1px solid ${COLOR.control}` } },
      el('div', { style: { position: 'absolute', left: 0, right: 0, bottom: meta + '%', 'border-top': `2px dashed ${COLOR.tinta}` } }),
      el('div', { style: { position: 'absolute', inset: 0, display: 'grid', 'grid-template-columns': `repeat(${Math.max(d.week.length, 1)}, minmax(0,1fr))`, gap: '18px', 'align-items': 'end' } },
        d.week.map((w) => {
          const ok = w.v >= meta;
          return el('div', { style: { position: 'relative', height: '100%' } },
            el('div', { style: { position: 'absolute', left: 0, right: 0, bottom: 0, height: w.v + '%', background: ok ? COLOR.acento : COLOR.warn, 'border-radius': '4px 4px 0 0' } }),
            el('span', { class: 'num', style: { position: 'absolute', left: 0, right: 0, bottom: `calc(${w.v}% + 4px)`, 'text-align': 'center', 'font-size': '12px', 'font-weight': 600, color: ok ? COLOR.tinta : COLOR.warnTxt }, text: `${w.v}%` }));
        })));
    const puntualidad = el('section', { class: 'tarjeta pad', style: { gap: '12px' }, 'aria-label': 'Puntualidad de la semana' },
      el('div', { class: 't-fila' }, el('h2', { text: 'Puntualidad de la semana' }), el('a', { class: 'enlace', href: '#/reportes', text: 'Ver reportes' })),
      el('div', { class: 'mini', text: `Viajes que llegaron a tiempo · meta ${meta}%` }),
      d.week.length ? graf : el('div', { class: 'vacio', style: { padding: '20px 0' }, text: 'Aún no hay viajes terminados esta semana.' }),
      el('div', { style: { display: 'grid', 'grid-template-columns': `repeat(${Math.max(d.week.length, 1)}, minmax(0,1fr))`, gap: '18px' } },
        d.week.map((w) => el('span', { class: 'mini', style: { 'text-align': 'center' }, text: w.day }))));

    // --- Alertas ---
    const dot = (lv) => (lv === 2 ? COLOR.warn : lv === 1 ? COLOR.watch : COLOR.gris2);
    const alertas = el('section', { class: 'tarjeta oculto', style: { 'flex-grow': 1 }, 'aria-label': 'Alertas' },
      el('div', { class: 't-enc', style: { padding: '14px 22px' } }, el('h2', { text: 'Alertas' }),
        el('span', { class: 'mini' }, el('span', { class: 'num', style: { 'font-weight': 700, color: COLOR.warnTxt }, text: d.critCount }), ` urgentes · ${d.alertCount} abiertas`)),
      d.alerts.length ? d.alerts.map((a) => el('a', { class: 'tr', href: `#/${a.href}`, style: { 'grid-template-columns': '10px minmax(0,1fr) 54px', 'min-height': '52px', padding: '6px 22px' } },
        el('span', { style: { width: '10px', height: '10px', 'border-radius': '50%', background: dot(a.lv) } }),
        el('span', { class: 'dos-lineas' }, el('span', { style: { 'font-size': '13px', 'font-weight': 500 }, text: a.text }), el('span', { style: { 'font-size': '11px', color: COLOR.gris }, text: a.module })),
        el('span', { class: 'num', style: { 'font-size': '11px', color: COLOR.gris, 'text-align': 'right' }, text: a.time }))) :
        el('div', { class: 'vacio', text: 'Sin alertas abiertas.' }));

    // --- Checklists de hoy ---
    const colorCl = { ok: COLOR.acento, obs: COLOR.watch, no: COLOR.warn, pend: COLOR.control };
    const cl = el('section', { class: 'tarjeta pad', style: { gap: '12px' }, 'aria-label': 'Checklists de hoy' },
      el('div', { class: 't-fila' }, el('h2', { text: 'Checklists de hoy' }),
        el('span', { class: 'sub', style: { 'font-size': '13px' } }, el('span', { class: 'num', style: { 'font-weight': 600, color: COLOR.tinta }, text: d.cl.done }), ` de ${d.cl.total} unidades`)),
      el('div', { style: { display: 'flex', height: '12px', 'border-radius': '4px', overflow: 'hidden', gap: '2px' } },
        d.cl.parts.filter((p) => p.count).map((p) => el('div', { style: { height: '100%', 'flex-grow': p.count, background: colorCl[p.key] } }))),
      el('div', { style: { display: 'grid', 'grid-template-columns': 'repeat(2, minmax(0,1fr))', gap: '8px 16px' } },
        d.cl.parts.map((p) => el('span', { style: { display: 'flex', 'align-items': 'center', gap: '8px', 'font-size': '13px' } },
          el('span', { class: 'cuadro', style: { background: colorCl[p.key] } }), p.label, el('span', { class: 'num', style: { 'margin-left': 'auto', 'font-weight': 600 }, text: p.count })))),
      d.cl.pendientes.length ? el('a', { class: 'enlace', href: `#/checklist/${d.cl.pendientes[0]}`, text: `Pendientes: ${d.cl.pendientes.join(', ')}` }) : el('span', { class: 'mini', text: 'Todas las unidades operando tienen checklist.' }));

    cont.replaceChildren(cab, kpis,
      el('div', { class: 'rejilla' },
        el('div', { class: 'col' }, vivo, el('div', { style: { display: 'grid', 'grid-template-columns': 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', 'flex-grow': 1 } }, flota, puntualidad)),
        el('div', { class: 'col' }, alertas, cl)));

    clearInterval(timer);
    timer = setInterval(() => {
      vivoTxt.textContent = horaAhora();
      if (document.visibilityState === 'visible' && location.hash.startsWith('#/inicio')) mostrar(cont).catch(() => {});
    }, 60000);
  }

  CP.vistas.inicio = { mostrar, salir: () => clearInterval(timer) };
})();

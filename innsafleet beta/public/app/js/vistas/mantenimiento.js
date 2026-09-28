/* Mantenimiento · taller, daños y neumáticos */
(() => {
  'use strict';
  const { el, api, fmt, aviso, COLOR, icono, modal, cerrarModal, formulario, fechaCorta, fechaDM, esAdmin, estado } = CP;
  let sel = null;

  const STATUS = {
    'Esperando refacción': ['#FBF1D9', '#7A4E0A'],
    'En reparación': ['#E3EEF0', '#0A4555'],
    'Diagnóstico': ['#ECEAE4', '#3A3F44'],
    'Listo hoy': ['#E4F0E1', '#2F5A28'],
  };
  const XY = [[44, 22], [44, 182], [318, 0], [318, 38], [318, 166], [318, 204]];
  const OK = { bg: '#E3EEF0', fg: '#0A4555' };
  const WATCH = { bg: '#FBF1D9', border: '#D69E2E', fg: '#7A4E0A' };
  const BAD = { bg: '#FDE7DA', border: '#C2410C', fg: '#8A3410' };

  async function mostrar(cont, param) {
    const d = await api('GET', '/api/mantenimiento');
    if (param) sel = param.toUpperCase();
    const minMm = d.minMm, watchMm = d.watchMm;
    const lowPsi = (p, t) => p != null && p < t * 0.9;
    const level = (mm, p, t) => (mm == null ? -1 : mm < minMm ? 2 : mm < watchMm || lowPsi(p, t) ? 1 : 0);

    // --- Neumáticos: conteos y alertas ---
    let change = 0, watch = 0;
    const alerts = [];
    const worst = new Map();
    for (const u of d.tires) {
      let w = -1;
      u.mm.forEach((mm, i) => {
        const p = u.psi[i];
        const lv = level(mm, p, u.target);
        w = Math.max(w, lv);
        if (lv === 2) change++;
        if (lv === 1) watch++;
        if (lv === 2 || (mm != null && lowPsi(p, u.target))) {
          alerts.push({ unit: u.id, pos: d.posiciones[i], mm, psi: p, rank: lv * 100 - mm, lv, low: lowPsi(p, u.target) });
        }
      });
      worst.set(u.id, w);
    }
    alerts.sort((a, b) => b.rank - a.rank);

    const operando = d.total - d.enTaller - d.fueraServicio;
    const dias = d.shop.map((s) => s.dias);
    const cab = el('div', { class: 'cabecera' },
      el('div', { class: 'tit' }, el('h1', { text: 'Mantenimiento' }), el('div', { class: 'sub', text: `Estado de la flota al ${fechaCorta(d.hoy)} · taller, daños y neumáticos` })),
      el('div', { class: 'acciones-cab solo-admin' },
        el('button', { type: 'button', class: 'btn sec', text: 'Registrar daño grave', onclick: () => registrarDano(cont) }),
        el('button', { type: 'button', class: 'btn', onclick: () => ingresoTaller(cont) }, icono('mas'), 'Registrar ingreso a taller')));

    const kpis = el('section', { class: 'kpis', 'aria-label': 'Resumen' },
      CP.kpi({ et: 'Disponibilidad de flota', valor: d.total ? Math.round((operando / d.total) * 100) : 0, unidad: '%', pie: `${operando} de ${d.total} unidades operando`, color: COLOR.acento }),
      CP.kpi({ et: 'Unidades en taller', valor: d.shop.length, pie: el('span', {}, 'Promedio ', el('span', { class: 'num', text: dias.length ? (dias.reduce((a, b) => a + b, 0) / dias.length).toFixed(1) : '0' }), ' días en taller') }),
      CP.kpi({ et: 'Daño grave o permanente', valor: d.damage.length, pie: 'Fuera de servicio', alerta: true }),
      CP.kpi({ et: 'Neumáticos por cambiar', valor: change, pie: `Menos de ${minMm} mm de dibujo`, color: COLOR.warnTxt }),
      CP.kpi({ et: 'Neumáticos a vigilar', valor: watch, pie: 'Desgaste medio o presión baja', color: COLOR.watchTxt }));

    // --- Unidades en taller ---
    const COLS = '76px minmax(0,1fr) 104px 84px 96px 150px';
    const taller = el('section', { class: 'tarjeta oculto', 'aria-label': 'Unidades en taller' },
      el('div', { class: 't-enc base', style: { padding: '16px 24px' } }, el('h2', { text: 'Unidades en taller' }), el('span', { class: 'mini', text: `${d.shop.length} unidades` })),
      el('div', { class: 'th', style: { 'grid-template-columns': COLS, padding: '10px 24px' } },
        el('div', { text: 'Unidad' }), el('div', { text: 'Motivo' }), el('div', { text: 'Tipo' }), el('div', { style: { 'text-align': 'right' }, text: 'Días' }), el('div', { text: 'Salida est.' }), el('div', { text: 'Estado' })),
      d.shop.length ? d.shop.map((s) => {
        const c = STATUS[s.estado] || STATUS['Diagnóstico'];
        return el(esAdmin() ? 'button' : 'div', { type: esAdmin() ? 'button' : null, class: 'tr', style: { 'grid-template-columns': COLS, 'min-height': '62px' }, onclick: esAdmin() ? () => actualizarTaller(s, cont) : null },
          el('div', {}, el('span', { class: 'etq-u', text: s.unidad })),
          el('div', { class: 'dos-lineas', style: { gap: '2px' } }, el('span', { style: { 'font-weight': 500 }, text: s.motivo }), el('span', { class: 'l2', text: `${s.taller} · ingresó ${fechaDM(s.ingreso)}` })),
          el('div', { style: { 'font-size': '13px', color: COLOR.tinta2 }, text: s.tipo }),
          el('div', { class: 'num', style: { 'text-align': 'right', 'font-weight': 600, color: s.dias >= 7 ? COLOR.warnTxt : COLOR.tinta }, text: s.dias }),
          el('div', { class: 'num', style: { 'font-size': '13px' }, text: s.salida_estimada ? fechaDM(s.salida_estimada) : '—' }),
          el('div', {}, el('span', { class: 'pill', style: { background: c[0], color: c[1] }, text: s.estado })));
      }) : el('div', { class: 'vacio', text: 'No hay unidades en taller.' }));

    // --- Daño grave o permanente ---
    const danos = el('section', { class: 'tarjeta', style: { 'flex-grow': 1 }, 'aria-label': 'Daño grave o permanente' },
      el('div', { class: 't-enc base', style: { padding: '16px 24px' } }, el('h2', { text: 'Daño grave o permanente' }), el('span', { class: 'mini', text: 'Unidades fuera de servicio' })),
      d.damage.length ? el('div', { style: { padding: '18px 24px', display: 'grid', 'grid-template-columns': 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' } },
        d.damage.map((x) => {
          const perm = x.nivel === 'Permanente';
          return el('div', { style: { border: `1px solid ${perm ? '#E7CBB8' : '#E2E0DA'}`, 'border-radius': '14px', padding: '18px', display: 'flex', 'flex-direction': 'column', gap: '12px', background: perm ? '#FBF8F6' : '#fff' } },
            el('div', { class: 't-fila', style: { 'align-items': 'center' } }, el('span', { class: 'etq-u', style: { 'font-size': '14px' }, text: x.unidad }),
              el('span', { class: `pill ${perm ? 'negro' : 'mal'}`, style: { 'font-weight': 700 }, text: x.nivel })),
            el('div', { class: 'dos-lineas', style: { gap: '4px' } }, el('div', { style: { 'font-size': '16px', 'font-weight': 600 }, text: x.titulo }), el('div', { style: { 'font-size': '13px', color: COLOR.tinta2 }, text: x.detalle })),
            el('div', { style: { display: 'grid', 'grid-template-columns': '96px minmax(0,1fr)', 'row-gap': '6px', 'font-size': '13px' } },
              el('span', { style: { color: COLOR.gris }, text: 'Fecha' }), el('span', { class: 'num', text: fechaCorta(x.fecha) }),
              el('span', { style: { color: COLOR.gris }, text: 'Seguimiento' }), el('span', { text: x.seguimiento || '—' }),
              el('span', { style: { color: COLOR.gris }, text: 'Cobertura' }), el('span', { text: x.cobertura || '—' })),
            el('button', { type: 'button', class: 'enlace solo-admin', style: { 'align-self': 'flex-start' }, text: 'Actualizar', onclick: () => actualizarDano(x, cont) }));
        })) : el('div', { class: 'vacio', text: 'Sin unidades con daño grave o permanente.' }));

    // --- Neumáticos ---
    if (!d.tires.some((u) => u.id === sel)) {
      const conProblema = d.tires.slice().sort((a, b) => (worst.get(b.id) ?? -1) - (worst.get(a.id) ?? -1));
      sel = conProblema[0]?.id || null;
    }
    const s = d.tires.find((u) => u.id === sel);
    const chips = el('div', { role: 'group', 'aria-label': 'Elegir unidad', style: { display: 'flex', 'flex-wrap': 'wrap', gap: '6px', 'max-height': '140px', 'overflow-y': 'auto' } },
      d.tires.map((u) => {
        const on = u.id === sel;
        const w = worst.get(u.id);
        return el('button', { type: 'button', 'aria-pressed': String(on), onclick: () => { sel = u.id; mostrar(cont); },
          style: { 'min-height': '40px', 'min-width': '60px', padding: '0 10px', 'border-radius': '9px', 'font-size': '13px', 'font-weight': 600, cursor: 'pointer', display: 'flex', 'align-items': 'center', 'justify-content': 'center', gap: '6px', border: `1px solid ${on ? COLOR.tinta : COLOR.control}`, background: on ? COLOR.tinta : '#fff', color: on ? '#fff' : COLOR.tinta } },
          el('span', { class: 'num', text: u.id }),
          el('span', { 'aria-hidden': 'true', style: { width: '7px', height: '7px', 'border-radius': '50%', background: w === 2 ? BAD.border : w === 1 ? WATCH.border : w === 0 ? COLOR.acento : COLOR.control } }));
      }));

    const diagrama = el('div', { style: { position: 'relative', width: '492px', 'max-width': '100%', height: '240px', 'align-self': 'center' } },
      el('div', { style: { position: 'absolute', left: '24px', top: '80px', width: '444px', height: '80px', 'border-radius': '26px 14px 14px 26px', background: COLOR.borde2, border: `1px solid ${COLOR.control}`, display: 'flex', 'align-items': 'center', 'padding-left': '20px', 'font-size': '11px', 'font-weight': 700, 'letter-spacing': '1px', color: COLOR.gris2 }, text: 'FRENTE' }),
      s ? s.mm.map((mm, i) => {
        const p = s.psi[i];
        const lv = level(mm, p, s.target);
        const c = lv === 2 ? BAD : lv === 1 ? WATCH : lv === 0 ? { bg: OK.bg, border: COLOR.acento, fg: OK.fg } : { bg: '#fff', border: COLOR.control, fg: COLOR.gris2 };
        return el('div', { title: d.posiciones[i], style: { position: 'absolute', left: XY[i][0] + 'px', top: XY[i][1] + 'px', width: '100px', height: '36px', 'border-radius': '8px', border: `2px solid ${c.border}`, background: c.bg, display: 'flex', 'flex-direction': 'column', 'align-items': 'center', 'justify-content': 'center', 'line-height': 1.15 } },
          el('span', { class: 'num', style: { 'font-size': '13px', 'font-weight': 700, color: c.fg }, text: mm != null ? `${fmt(mm, 1)} mm` : '— mm' }),
          el('span', { class: 'num', style: { 'font-size': '11px', color: lowPsi(p, s.target) ? BAD.fg : COLOR.gris }, text: p != null ? `${p} psi` : '— psi' }));
      }) : null);

    const llantas = el('section', { class: 'tarjeta', style: { padding: '20px 24px', gap: '12px' }, 'aria-label': 'Neumáticos' },
      el('div', { class: 't-fila' }, el('h2', { text: 'Neumáticos' }), el('span', { class: 'mini', text: 'Dibujo en mm · presión en psi' })),
      chips,
      s ? el('div', { class: 't-fila', style: { 'padding-top': '4px' } },
        el('div', { style: { 'font-size': '15px', 'font-weight': 600 } }, s.id, el('span', { style: { 'font-weight': 400, color: COLOR.gris, 'font-size': '13px' } }, ` · ${s.type} · presión objetivo `, el('span', { class: 'num', text: s.target }), ' psi')),
        el('span', { class: 'mini', text: s.checked ? `Revisión ${fechaDM(s.checked)}` : 'Sin revisión' })) : null,
      diagrama,
      el('div', { class: 'leyenda', style: { 'justify-content': 'center', gap: '16px' } },
        el('span', {}, el('span', { class: 'cuadro', style: { background: COLOR.acento } }), `Bien (≥ ${watchMm} mm)`),
        el('span', {}, el('span', { class: 'cuadro', style: { background: COLOR.watch } }), 'Vigilar'),
        el('span', {}, el('span', { class: 'cuadro', style: { background: COLOR.warn } }), `Cambiar (< ${minMm} mm)`)),
      s ? el('button', { type: 'button', class: 'btn m sec solo-admin', text: `Registrar revisión de ${s.id}`, onclick: () => revisarLlantas(s, d, cont) }) : null,
      el('div', { style: { 'border-top': `1px solid ${COLOR.borde2}`, 'padding-top': '14px', display: 'flex', 'flex-direction': 'column', gap: '8px' } },
        el('div', { style: { 'font-size': '13px', 'font-weight': 600 }, text: 'Alertas de la flota' }),
        alerts.length ? alerts.slice(0, 6).map((a) => el('div', { style: { display: 'grid', 'grid-template-columns': '58px minmax(0,1fr) 70px 64px 92px', gap: '10px', 'align-items': 'center', 'font-size': '13px', 'min-height': '30px' } },
          el('span', { class: 'num', style: { 'font-weight': 600 }, text: a.unit }),
          el('span', { style: { color: COLOR.tinta2 }, text: a.pos }),
          el('span', { class: 'num', style: { 'text-align': 'right', color: a.mm < minMm ? BAD.fg : COLOR.tinta, 'font-weight': 600 }, text: `${fmt(a.mm, 1)} mm` }),
          el('span', { class: 'num', style: { 'text-align': 'right', color: a.low ? BAD.fg : COLOR.gris }, text: `${a.psi} psi` }),
          el('span', { class: `pill ${a.lv === 2 ? 'mal' : 'vig'}`, style: { 'justify-self': 'end', padding: '2px 8px', 'font-size': '11px', 'font-weight': 700 }, text: a.lv === 2 ? 'Cambiar' : 'Presión baja' })))
          : el('span', { class: 'mini', text: 'Sin alertas de neumáticos.' })));

    cont.replaceChildren(cab, kpis, el('div', { class: 'rejilla', style: { 'grid-template-columns': 'minmax(0,1fr) 540px', 'flex-grow': 1 } },
      el('div', { class: 'col', style: { gap: '24px' } }, taller, danos), llantas));
  }

  // ---------------- Modales ----------------
  async function opcionesUnidades() {
    const u = await api('GET', '/api/unidades');
    return u.unidades.map((x) => [x.id, `${x.id} · ${x.type}`]);
  }

  async function ingresoTaller(cont, unidad) {
    const ops = await opcionesUnidades();
    modal('Registrar ingreso a taller', formulario([
      [{ name: 'unidad', label: 'Unidad', type: 'select', value: unidad || '', options: ops, required: true },
       { name: 'tipo', label: 'Tipo', type: 'select', value: 'Correctivo', options: ['Correctivo', 'Preventivo'] }],
      { name: 'motivo', label: 'Motivo', required: true, maxlength: 120, placeholder: 'Ej. Balatas y discos traseros' },
      [{ name: 'taller', label: 'Taller', maxlength: 60, value: 'Taller interno' },
       { name: 'estado', label: 'Estado', type: 'select', value: 'Diagnóstico', options: Object.keys(STATUS) }],
      [{ name: 'ingreso', label: 'Fecha de ingreso', type: 'date', value: estado.yo.hoy }, { name: 'salidaEstimada', label: 'Salida estimada', type: 'date' }],
    ], {
      texto: 'Registrar ingreso',
      enviar: async (d) => {
        await api('POST', '/api/taller', { ...d, salidaEstimada: d.salidaEstimada || null });
        cerrarModal(); aviso('Ingreso a taller registrado.'); mostrar(cont);
      },
    }));
  }

  function actualizarTaller(s, cont) {
    const f = formulario([
      [{ name: 'estado', label: 'Estado', type: 'select', value: s.estado, options: Object.keys(STATUS) },
       { name: 'salidaEstimada', label: 'Salida estimada', type: 'date', value: s.salida_estimada || '' }],
    ], {
      texto: 'Guardar',
      enviar: async (d) => {
        await api('PUT', `/api/taller/${s.id}`, { ...d, salidaEstimada: d.salidaEstimada || null });
        cerrarModal(); aviso('Actualizado.'); mostrar(cont);
      },
    });
    const cerrar = el('div', { class: 'caja', style: { gap: '10px' } },
      el('strong', { text: 'Dar salida del taller' }),
      el('label', { class: 'campo chk' }, el('input', { type: 'checkbox', id: 'fue-servicio', checked: s.tipo === 'Preventivo' }), 'Fue servicio preventivo (reinicia el contador de km)'),
      el('button', { type: 'button', class: 'btn m', text: `Liberar ${s.unidad} a operación`, onclick: (e) => CP.conBoton(e.currentTarget, async () => {
        await api('PUT', `/api/taller/${s.id}`, { cerrar: true, fueServicio: document.getElementById('fue-servicio').checked });
        cerrarModal(); aviso(`${s.unidad} regresó a operación.`); mostrar(cont);
      }) }));
    modal(`${s.unidad} · ${s.motivo}`, el('div', { style: { display: 'flex', 'flex-direction': 'column', gap: '16px' } }, f, cerrar));
  }

  async function registrarDano(cont) {
    const ops = await opcionesUnidades();
    modal('Registrar daño grave o permanente', formulario([
      [{ name: 'unidad', label: 'Unidad', type: 'select', options: ops, required: true },
       { name: 'nivel', label: 'Nivel', type: 'select', value: 'Grave', options: ['Grave', 'Permanente'] },
       { name: 'fecha', label: 'Fecha', type: 'date', value: estado.yo.hoy }],
      { name: 'titulo', label: 'Qué pasó', required: true, maxlength: 100, placeholder: 'Ej. Motor desvielado' },
      { name: 'detalle', label: 'Detalle', type: 'textarea', max: 300 },
      [{ name: 'seguimiento', label: 'Seguimiento', maxlength: 120, placeholder: 'Ej. Trámite con aseguradora' },
       { name: 'cobertura', label: 'Cobertura de la ruta', maxlength: 120, placeholder: 'Ej. Ruta cubierta con C40' }],
    ], {
      texto: 'Registrar',
      enviar: async (d) => {
        await api('POST', '/api/danos', d);
        cerrarModal(); aviso('Daño registrado; la unidad quedó fuera de servicio.'); mostrar(cont);
      },
    }));
  }

  function actualizarDano(x, cont) {
    modal(`${x.unidad} · ${x.titulo}`, formulario([
      { name: 'seguimiento', label: 'Seguimiento', maxlength: 120, value: x.seguimiento },
      { name: 'cobertura', label: 'Cobertura', maxlength: 120, value: x.cobertura },
      { name: 'cerrar', label: 'Cerrar este caso', type: 'checkbox', value: false },
      { name: 'regresaOperacion', label: 'La unidad regresa a operación', type: 'checkbox', value: false },
    ], {
      enviar: async (d) => {
        await api('PUT', `/api/danos/${x.id}`, d);
        cerrarModal(); aviso('Actualizado.'); mostrar(cont);
      },
    }));
  }

  function revisarLlantas(s, d, cont) {
    const campos = d.posiciones.map((p, i) => [
      { name: `mm${i}`, label: `${p} · mm`, type: 'number', step: 0.1, min: 0, max: 30, value: s.mm[i] ?? '', required: true },
      { name: `psi${i}`, label: `${p} · psi`, type: 'number', min: 0, max: 200, value: s.psi[i] ?? s.target, required: true },
    ]);
    campos.push({ name: 'revisado', label: 'Fecha de revisión', type: 'date', value: estado.yo.hoy });
    modal(`Revisión de neumáticos · ${s.id}`, formulario(campos, {
      texto: 'Guardar revisión',
      enviar: async (v) => {
        const neumaticos = d.posiciones.map((_, i) => ({ mm: v[`mm${i}`], psi: v[`psi${i}`] }));
        await api('PUT', `/api/neumaticos/${encodeURIComponent(s.id)}`, { neumaticos, revisado: v.revisado });
        cerrarModal(); aviso('Revisión guardada.'); mostrar(cont);
      },
    }));
  }

  CP.vistas.mantenimiento = { mostrar };
})();

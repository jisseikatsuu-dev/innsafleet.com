/* Unidades · lista y ficha */
(() => {
  'use strict';
  const { el, api, fmt, aviso, COLOR, modal, cerrarModal, formulario, icono, segmentado, fechaCorta, diasHasta, estado } = CP;
  let filtro = 'all';
  let sel = null;

  const ST = {
    ruta: { label: 'En ruta', bg: '#E3EEF0', fg: '#0A4555', dot: '#0F5F73', group: 'op' },
    iniciar: { label: 'Por iniciar', bg: '#ECEFF0', fg: '#3A4B50', dot: '#7C9BA3', group: 'op' },
    patio: { label: 'En patio', bg: '#F0EEE9', fg: '#3A3F44', dot: '#9FB5BA', group: 'op' },
    taller: { label: 'En taller', bg: '#FBF1D9', fg: '#7A4E0A', dot: '#D69E2E', group: 'taller' },
    baja: { label: 'Fuera de servicio', bg: '#FDE7DA', fg: '#8A3410', dot: COLOR.warn, group: 'baja' },
  };
  const NOTE = { taller: ['#FBF1D9', '#7A4E0A'], baja: ['#FDE7DA', '#8A3410'] };
  const pillEstado = (st, grande) => {
    const s = ST[st];
    return el('span', { class: 'pill', style: { background: s.bg, color: s.fg, padding: grande ? '5px 12px' : null } }, el('span', { class: 'p', style: { background: s.dot } }), s.label);
  };

  function svc(u) {
    if (u.odo == null || u.next == null) return { svcTxt: 'Sin odómetro', svcPct: 0, svcBar: COLOR.control, svcColor: COLOR.gris2 };
    const left = u.next - u.odo;
    const over = left <= 0;
    return {
      svcTxt: over ? `Vencido ${fmt(-left)} km` : `en ${fmt(left)} km`,
      svcPct: over ? 100 : Math.max(0, Math.round((1 - left / u.interval) * 100)),
      svcBar: over ? COLOR.warn : left < 2000 ? COLOR.watch : COLOR.acento,
      svcColor: over ? COLOR.warnTxt : left < 2000 ? COLOR.watchTxt : COLOR.tinta,
    };
  }
  function kml(u) {
    if (u.kml == null) return { kml: '—', full: 'Sin datos del periodo', color: COLOR.gris2 };
    const ok = !u.meta || u.kml >= u.meta;
    return { kml: fmt(u.kml, 2), full: `${fmt(u.kml, 2)} km/L${u.meta ? ' · meta ' + fmt(u.meta, 1) : ''}`, color: ok ? COLOR.tinta : COLOR.warnTxt };
  }

  async function mostrar(cont, param) {
    const d = await api('GET', '/api/unidades');
    const U = d.unidades;
    if (param) sel = param.toUpperCase();

    const grupos = [['all', 'Todas'], ['op', 'Operando'], ['taller', 'En taller'], ['baja', 'Fuera de servicio']];
    const cuenta = (g) => U.filter((u) => g === 'all' || ST[u.st].group === g).length;
    const lista = U.filter((u) => filtro === 'all' || ST[u.st].group === filtro);
    if (!lista.some((u) => u.id === sel)) sel = lista[0]?.id || U[0]?.id || null;

    const tipos = {};
    for (const u of U) tipos[u.type] = (tipos[u.type] || 0) + 1;
    const resumen = Object.entries(tipos).map(([t, n]) => `${n} ${t}`).join(' y ');

    const cab = el('div', { class: 'cabecera' },
      el('div', { class: 'tit' }, el('h1', { text: 'Unidades' }), el('div', { class: 'sub', text: `${U.length} unidades${resumen ? ' · ' + resumen : ''}` })),
      el('div', { class: 'acciones-cab' },
        segmentado(grupos.map(([k, l]) => [k, l, cuenta(k)]), filtro, (k) => { filtro = k; mostrar(cont); }, { etiqueta: 'Filtrar por estado' }),
        el('button', { type: 'button', class: 'btn solo-admin', onclick: () => editarUnidad(null, cont) }, icono('mas'), 'Alta de unidad')));

    const COLS = '136px 132px minmax(0,1fr) 150px 150px 66px';
    const filas = lista.map((u) => {
      const s = svc(u);
      const k = kml(u);
      return el('button', {
        type: 'button', class: 'tr', 'aria-pressed': String(u.id === sel), style: { 'grid-template-columns': COLS },
        onclick: () => { sel = u.id; mostrar(cont); },
      },
        el('span', { class: 'dos-lineas' }, el('span', { class: 'num', style: { 'font-weight': 700, 'font-size': '15px' }, text: u.id }), el('span', { class: 'l2', text: `${u.type}${u.year ? ' · ' + u.year : ''}` })),
        el('span', {}, pillEstado(u.st)),
        el('span', { class: 'dos-lineas' }, el('span', { class: 'recorte', style: { 'font-weight': 500 }, text: u.route }), el('span', { class: 'l2', text: u.client || '—' })),
        el('span', { class: 'recorte', style: { 'font-size': '13px', color: u.driver === 'Sin asignar' ? COLOR.gris2 : COLOR.tinta2 }, text: u.driver }),
        el('span', { style: { display: 'flex', 'flex-direction': 'column', gap: '5px' } },
          el('span', { class: 'num', style: { 'font-size': '12px', color: s.svcColor, 'font-weight': 600 }, text: s.svcTxt }),
          el('span', { class: 'barra', style: { height: '5px' } }, el('span', { style: { width: s.svcPct + '%', background: s.svcBar } }))),
        el('span', { class: 'num', style: { 'text-align': 'right', 'font-weight': 600, color: k.color }, text: k.kml }));
    });

    const tabla = el('section', { class: 'tarjeta oculto', 'aria-label': 'Lista de unidades' },
      el('div', { class: 'th borde', style: { 'grid-template-columns': COLS } }, ['Unidad', 'Estado', 'Asignación', 'Chofer', 'Próx. servicio'].map((t) => el('div', { text: t })), el('div', { style: { 'text-align': 'right' }, text: 'km/L' })),
      el('div', { class: 'lista-scroll' }, filas.length ? filas : el('div', { class: 'vacio', text: 'Sin unidades en este filtro.' })));

    const u = U.find((x) => x.id === sel);
    const ficha = u ? await pintarFicha(u, d, cont) : el('aside', { class: 'tarjeta vacio', text: 'Sin unidades.' });
    cont.replaceChildren(cab, el('div', { class: 'rejilla', style: { 'flex-grow': 1 } }, tabla, ficha));
  }

  async function pintarFicha(u, d, cont) {
    const hoyU = await api('GET', `/api/unidades/${encodeURIComponent(u.id)}/hoy`).catch(() => ({ checklist: '—', tires: '—' }));
    const s = svc(u);
    const k = kml(u);
    let polVal = 'Sin capturar', polColor = COLOR.gris2;
    if (u.polizaNota) { polVal = u.polizaNota; polColor = COLOR.warnTxt; }
    else if (u.poliza) {
      const dias = diasHasta(u.poliza, d.hoy);
      polVal = dias < 0 ? `vencida ${fechaCorta(u.poliza)}` : `vence ${fechaCorta(u.poliza)}`;
      polColor = dias < 0 ? COLOR.warnTxt : dias <= d.diasAviso ? COLOR.watchTxt : COLOR.tinta;
    }
    const clColor = hoyU.checklist === 'Apta' ? COLOR.acentoOsc : hoyU.checklist === 'Con observaciones' ? COLOR.watchTxt : hoyU.checklist === 'No apta' ? COLOR.warnTxt : COLOR.gris;
    const dato = (kk, v, mono, color) => el('div', { class: 'dato' }, el('span', { class: 'k', text: kk }), el('span', { class: 'v' + (mono ? ' num' : ''), style: color ? { color } : null, text: v }));
    const fila = (kk, v, color) => el('div', { style: { display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', 'min-height': '32px', 'font-size': '13px' } }, el('span', { text: kk }), el('span', { class: 'num', style: { 'font-weight': 600, color: color || COLOR.tinta }, text: v }));

    return el('aside', { class: 'tarjeta', style: { padding: '22px 24px', gap: '18px' }, 'aria-label': 'Ficha de la unidad' },
      el('div', { style: { display: 'flex', 'justify-content': 'space-between', 'align-items': 'flex-start', gap: '10px' } },
        el('div', { class: 'dos-lineas', style: { gap: '4px' } },
          el('span', { class: 'eyebrow', text: 'Ficha de unidad' }),
          el('h2', { class: 'num', style: { 'font-size': '30px', 'font-weight': 700 }, text: u.id }),
          el('span', { class: 'sub', style: { 'font-size': '13px' }, text: `${u.type}${u.year ? ' · modelo ' + u.year : ''}${u.cap ? ' · ' + u.cap + ' pasajeros' : ''}` })),
        pillEstado(u.st, true)),
      u.note ? el('div', { class: 'nota', style: { background: (NOTE[u.st] || ['#F0EEE9'])[0], color: (NOTE[u.st] || [0, '#3A3F44'])[1] }, text: u.note }) : null,
      el('div', { class: 'datos2' },
        dato('Cliente', u.client || '—'), dato('Ruta asignada', u.route), dato('Chofer', u.driver), dato('Placas', u.plates || 'Sin capturar', true),
        dato('Odómetro', u.odo != null ? `${fmt(u.odo)} km` : 'Sin dato', true), dato('Rendimiento', k.full, true, k.color)),
      el('div', { class: 'sep', style: { display: 'flex', 'flex-direction': 'column', gap: '8px' } },
        el('div', { class: 't-fila' }, el('span', { style: { 'font-size': '14px', 'font-weight': 600 }, text: 'Próximo servicio' }), el('span', { class: 'num', style: { 'font-size': '13px', 'font-weight': 600, color: s.svcColor }, text: s.svcTxt })),
        el('div', { class: 'barra', style: { height: '8px', 'border-radius': '4px' } }, el('span', { style: { width: s.svcPct + '%', background: s.svcBar } })),
        el('span', { class: 'num mini', text: u.next != null ? `Programado a los ${fmt(u.next)} km · cada ${fmt(u.interval)} km` : 'Captura el odómetro o vincula la unidad con Samsara' })),
      el('div', { class: 'sep', style: { display: 'flex', 'flex-direction': 'column', gap: '4px' } },
        el('span', { style: { 'font-size': '14px', 'font-weight': 600, 'margin-bottom': '4px' }, text: 'Documentos' }),
        fila('Póliza de seguro', polVal, polColor), fila('Tarjeta de circulación', u.tarjeta || '—'), fila('Verificación', u.st === 'baja' ? 'No aplica' : u.verificacion || '—')),
      el('div', { class: 'sep', style: { display: 'flex', 'flex-direction': 'column', gap: '4px' } },
        el('span', { style: { 'font-size': '14px', 'font-weight': 600, 'margin-bottom': '4px' }, text: 'Hoy' }),
        fila('Checklist de salida', hoyU.checklist, clColor),
        fila('Neumáticos', hoyU.tires, /cambiar|baja/.test(hoyU.tires) ? COLOR.warnTxt : COLOR.tinta),
        fila('Samsara', u.samsara ? 'Vinculada' : 'Sin vincular', u.samsara ? COLOR.acentoOsc : COLOR.gris2)),
      el('div', { style: { 'margin-top': 'auto', display: 'grid', 'grid-template-columns': 'repeat(3, minmax(0,1fr))', gap: '8px' } },
        el('a', { class: 'btn m', style: { 'font-size': '13px' }, href: '#/rutas', text: 'Recorrido' }),
        el('a', { class: 'btn m sec', style: { 'font-size': '13px' }, href: `#/checklist/${encodeURIComponent(u.id)}`, text: 'Checklist' }),
        el('a', { class: 'btn m sec', style: { 'font-size': '13px' }, href: '#/mantenimiento', text: 'Mantenimiento' })),
      el('button', { type: 'button', class: 'btn m sec solo-admin', text: 'Editar unidad', onclick: () => editarUnidad(u.id, cont) }));
  }

  async function editarUnidad(id, cont) {
    const [choferes, det] = await Promise.all([api('GET', '/api/choferes'), id ? api('GET', `/api/unidades/${encodeURIComponent(id)}/detalle`) : Promise.resolve({})]);
    const tipoDef = estado.yo.reglas;
    void tipoDef;
    const campos = [
      [{ name: 'unidad', label: 'Unidad (igual que en Samsara)', required: true, maxlength: 20, value: det.unidad || '' },
       { name: 'tipo', label: 'Tipo', type: 'select', value: det.tipo || 'Sprinter', options: ['Autobús', 'Sprinter', 'Camioneta', 'Otro'] },
       { name: 'capacidad', label: 'Pasajeros', type: 'number', min: 1, max: 120, value: det.capacidad ?? '' }],
      [{ name: 'anio', label: 'Modelo (año)', type: 'number', min: 1980, max: 2100, value: det.anio ?? '' },
       { name: 'placas', label: 'Placas', maxlength: 15, value: det.placas || '' },
       { name: 'cliente', label: 'Cliente', maxlength: 40, value: det.cliente || '' }],
      [{ name: 'choferId', label: 'Chofer asignado', type: 'select', value: det.chofer_id || '', options: [['', 'Sin asignar'], ...choferes.map((c) => [c.id, c.nombre])] },
       { name: 'estado', label: 'Estado', type: 'select', value: det.estado || 'operando', options: [['operando', 'Operando'], ['taller', 'En taller'], ['baja', 'Fuera de servicio']] }],
      [{ name: 'metaKml', label: 'Meta km/L', type: 'number', step: 0.01, min: 0.1, value: det.meta_kml ?? '' },
       { name: 'tanqueLitros', label: 'Tanque (L)', type: 'number', step: 1, min: 1, value: det.tanque_litros ?? '' },
       { name: 'psiObjetivo', label: 'Presión objetivo (psi)', type: 'number', min: 20, max: 200, value: det.psi_objetivo ?? '' }],
      [{ name: 'proxServicioKm', label: 'Próximo servicio (km)', type: 'number', min: 0, value: det.prox_servicio_km ?? '' },
       { name: 'polizaVence', label: 'Póliza vence', type: 'date', value: det.poliza_vence || '' },
       { name: 'polizaNota', label: 'Nota de póliza', maxlength: 80, value: det.poliza_nota || '', placeholder: 'Ej. En trámite de siniestro' }],
      [{ name: 'tarjeta', label: 'Tarjeta de circulación', maxlength: 40, value: det.tarjeta_circulacion || 'Vigente' },
       { name: 'verificacion', label: 'Verificación', maxlength: 40, value: det.verificacion || 'Vigente' }],
      { name: 'nota', label: 'Nota visible en la ficha', type: 'textarea', max: 200, value: det.nota || '' },
    ];
    const nuevoChofer = el('button', { type: 'button', class: 'enlace', text: '+ Registrar chofer nuevo', onclick: () => altaChofer(() => editarUnidad(id, cont)) });
    const f = formulario(campos, {
      texto: id ? 'Guardar cambios' : 'Dar de alta',
      extra: nuevoChofer,
      enviar: async (d) => {
        const body = { ...d };
        for (const k of Object.keys(body)) if (body[k] === '') body[k] = null;
        if (id) await api('PUT', `/api/unidades/${encodeURIComponent(id)}`, body);
        else await api('POST', '/api/unidades', body);
        cerrarModal(); aviso(id ? 'Unidad actualizada.' : 'Unidad dada de alta.');
        sel = (id || d.unidad).toUpperCase(); mostrar(cont);
      },
    });
    if (id) f.elements.unidad.readOnly = true;
    modal(id ? `Editar ${id}` : 'Alta de unidad', f, { ancho: true });
  }

  function altaChofer(despues) {
    modal('Registrar chofer', formulario([
      { name: 'nombre', label: 'Nombre completo', required: true, maxlength: 80 },
      [{ name: 'telefono', label: 'Teléfono', maxlength: 20 }, { name: 'licenciaVence', label: 'Licencia vence', type: 'date' }],
    ], {
      enviar: async (d) => {
        await api('POST', '/api/choferes', { ...d, licenciaVence: d.licenciaVence || null });
        aviso('Chofer registrado.'); cerrarModal(); despues();
      },
    }));
  }

  CP.vistas.unidades = { mostrar };
})();

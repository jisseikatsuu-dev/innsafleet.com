/* Rutas · Recorrido en vivo */
(() => {
  'use strict';
  const { el, api, fmt, aviso, COLOR, horaAhora, hace, modal, cerrarModal, formulario, conBoton, mapaBase, divIcon, icono, esAdmin, estado } = CP;
  let timer = null;
  let mapa = null;
  let capa = null;
  let fecha = null;
  let seleccion = null;
  let encuadrado = null;

  const LOOK = {
    ok: { bg: COLOR.acento, border: COLOR.acento, fg: '#fff', pill: 'Abordó', cls: 'ok' },
    omitida: { bg: COLOR.warn, border: COLOR.warn, fg: '#fff', pill: 'Omitido', cls: 'mal' },
    next: { bg: '#fff', border: COLOR.acento, fg: COLOR.acentoOsc, pill: 'Siguiente', cls: 'negro' },
    pendiente: { bg: '#fff', border: COLOR.gris2, fg: COLOR.tinta2, pill: 'Pendiente', cls: 'gris' },
  };

  function salir() {
    clearInterval(timer);
    if (mapa) { mapa.remove(); mapa = null; }
    encuadrado = null;
  }

  async function mostrar(cont, param) {
    clearInterval(timer);
    fecha = fecha || estado.yo.hoy;
    const lista = await api('GET', `/api/viajes?fecha=${fecha}`);
    const viajes = lista.viajes;
    if (param && /^\d+$/.test(param)) seleccion = Number(param);
    if (!viajes.find((v) => v.id === seleccion)) {
      const pref = viajes.find((v) => v.estado === 'en_ruta') || viajes.find((v) => v.estado === 'por_iniciar') || viajes[0];
      seleccion = pref ? pref.id : null;
    }
    await pintar(cont, viajes);
    timer = setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const l = await api('GET', `/api/viajes?fecha=${fecha}`);
        await pintar(cont, l.viajes, true);
      } catch { /* siguiente vuelta */ }
    }, 30000);
  }

  async function pintar(cont, viajes, refresco = false) {
    const r = seleccion ? await api('GET', `/api/viajes/${seleccion}`) : null;

    // ---- Pestañas: viajes activos y próximos; el resto en un selector ----
    const destacados = viajes.filter((v) => v.estado === 'en_ruta').concat(viajes.filter((v) => v.estado === 'por_iniciar')).slice(0, 3);
    if (r && !destacados.find((v) => v.id === r.id)) destacados.unshift(viajes.find((v) => v.id === r.id));
    const tabs = el('div', { class: 'seg', role: 'group', 'aria-label': 'Elegir ruta' },
      destacados.slice(0, 3).map((t) => el('button', {
        type: 'button', 'aria-pressed': String(t.id === seleccion), style: { 'min-height': '44px', padding: '0 14px', 'flex-direction': 'column', 'align-items': 'flex-start', 'justify-content': 'center', gap: '1px' },
        onclick: () => { seleccion = t.id; encuadrado = null; location.hash = `#/rutas/${t.id}`; },
      }, el('span', { style: { 'font-size': '14px', 'font-weight': 600, color: COLOR.tinta }, text: t.name }),
         el('span', { style: { 'font-size': '11px', color: t.delay > estado.yo.reglas.toleranciaRetardoMin ? COLOR.warnTxt : COLOR.gris }, text: `${t.unit} · ${t.state}` }))));
    const selector = el('select', { class: 'sel', 'aria-label': 'Otro viaje del día', onchange: (e) => { if (e.target.value) { seleccion = Number(e.target.value); encuadrado = null; location.hash = `#/rutas/${seleccion}`; } } },
      el('option', { value: '', text: `Todos los viajes (${viajes.length})` }),
      viajes.map((v) => el('option', { value: v.id, selected: v.id === seleccion, text: `${v.dep} · ${v.client} · ${v.name} · ${v.unit} · ${v.state}` })));
    const selFecha = el('input', { type: 'date', class: 'inp', value: fecha, 'aria-label': 'Fecha', onchange: (e) => { fecha = e.target.value || estado.yo.hoy; seleccion = null; encuadrado = null; mostrar(cont); } });

    const cab = el('div', { class: 'cabecera' },
      el('div', { class: 'tit' },
        el('div', { style: { display: 'flex', 'align-items': 'center', gap: '12px' } },
          el('h1', { text: 'Recorrido' }),
          el('span', { class: 'pill ok' }, el('span', { class: 'p', style: { width: '8px', height: '8px', background: estado.yo.samsara ? COLOR.acento : COLOR.gris2 } }),
            estado.yo.samsara ? 'En vivo · ' : 'Sin GPS · ', el('span', { class: 'num', text: horaAhora() }))),
        r ? el('div', { class: 'sub' }, `${r.name} (${r.sentido.toLowerCase()}) · `, el('span', { class: 'num', style: { 'font-weight': 600, color: COLOR.tinta }, text: r.unit || '—' }), ` · ${r.driver} · ${r.client}`)
          : el('div', { class: 'sub', text: 'No hay viajes programados para esta fecha.' })),
      el('div', { class: 'acciones-cab' }, tabs, selector, selFecha,
        el('button', { type: 'button', class: 'btn-borde solo-admin', text: 'Geocercas', onclick: () => abrirGeocercas() })));

    if (!r) { cont.replaceChildren(cab, el('div', { class: 'tarjeta vacio', text: 'Sin viajes. Revisa que las rutas estén activas para este día.' })); return; }

    // ---- Paradas: calcula la "siguiente" ----
    let siguienteMarcada = false;
    const stops = r.stops.map((s) => {
      let st = s.st;
      if (st === 'pendiente' && !siguienteMarcada && r.estado !== 'terminado') { st = 'next'; siguienteMarcada = true; }
      return { ...s, vis: st };
    });
    const riders = stops.reduce((a, s) => a + (s.st === 'ok' ? s.riders || 0 : 0), 0);
    const miss = stops.filter((s) => s.st === 'omitida').length;

    // ---- Tarjeta de mapa ----
    const contMapa = el('div', { class: 'mapa' });
    const sobre = el('div', { class: 'sobre-mapa' },
      el('div', { class: 'dato' }, el('span', { class: 'k', text: 'Distancia' }), el('span', { class: 'v num', text: `${fmt(r.kmDone, 1)} km` })),
      el('div', { class: 'dato' }, el('span', { class: 'k', text: 'Velocidad' }), el('span', { class: 'v num', text: `${r.speed} km/h` })),
      el('div', { class: 'dato' }, el('span', { class: 'k', text: 'Último GPS' }), el('span', { class: 'v num', text: r.gpsTiempo ? hace(r.gpsTiempo) : '—' })));
    contMapa.append(sobre);
    const tarjetaMapa = el('section', { class: 'tarjeta oculto', 'aria-label': 'Mapa de la ruta' },
      el('div', { class: 't-enc', style: { padding: '14px 20px' } }, el('h2', { text: 'Mapa y ruta' }),
        el('div', { class: 'leyenda' },
          el('span', {}, el('span', { style: { width: '18px', height: '4px', 'border-radius': '2px', background: COLOR.acento } }), 'Recorrido hecho'),
          el('span', {}, el('span', { style: { width: '18px', height: '4px', 'border-radius': '2px', background: '#9CC3CC' } }), 'Por recorrer'),
          el('span', {}, el('span', { style: { width: '18px', height: 0, 'border-top': '3px dashed #6B4FA0' } }), 'Vía alterna'),
          el('span', {}, el('span', { style: { width: '12px', height: '12px', 'border-radius': '50%', background: COLOR.warn } }), 'Omisión'),
          el('button', { type: 'button', class: 'enlace solo-admin', text: 'Editar ruta', onclick: () => editarRuta(r) }))),
      contMapa);

    // ---- Tiempo de ruta ----
    const tol = r.tolerancia;
    const tarde = r.delay > tol;
    const maxMin = Math.max(r.bars.prog, r.bars.est || 0, r.bars.avg || 0) * 1.08 || 1;
    const barra = (label, min, color) => el('div', { style: { display: 'grid', 'grid-template-columns': '110px minmax(0,1fr) 56px', gap: '10px', 'align-items': 'center', 'font-size': '12px' } },
      el('span', { style: { color: COLOR.gris }, text: label }),
      el('div', { style: { height: '10px', background: '#F0EEE9', 'border-radius': '3px' } }, el('div', { style: { height: '100%', width: min != null ? `${(min / maxMin) * 100}%` : '0', background: color, 'border-radius': '3px' } })),
      el('span', { class: 'num', style: { 'text-align': 'right', 'font-weight': 600 }, text: min != null ? `${min} min` : '—' }));
    const tiempo = el('section', { class: 'tarjeta pad', 'aria-label': 'Tiempo de ruta' },
      el('div', { class: 't-fila', style: { 'align-items': 'center' } }, el('h2', { text: 'Tiempo de ruta' }),
        el('span', { class: `pill num ${tarde ? 'mal' : 'ok'}`, style: { 'font-weight': 700 }, text: r.delay > 0 ? `+${r.delay} min` : 'A tiempo' })),
      el('div', { style: { display: 'grid', 'grid-template-columns': 'repeat(3, minmax(0,1fr))', gap: '12px' } },
        el('div', { class: 'dato' }, el('span', { class: 'k', text: 'Salida' }), el('span', { class: 'num', style: { 'font-size': '18px', 'font-weight': 600 }, text: r.depReal }), el('span', { class: 'n num', text: `prog. ${r.dep}` })),
        el('div', { class: 'dato' }, el('span', { class: 'k', text: r.sentido === 'ENTRADA' ? 'Llegada prog.' : 'Fin prog.' }), el('span', { class: 'num', style: { 'font-size': '18px', 'font-weight': 600 }, text: r.arr }), el('span', { class: 'n', text: r.sentido === 'ENTRADA' ? 'a planta' : 'última parada' })),
        el('div', { class: 'dato' }, el('span', { class: 'k', text: r.arrReal ? 'Llegada real' : 'Llegada estimada' }), el('span', { class: 'num', style: { 'font-size': '18px', 'font-weight': 700, color: tarde ? COLOR.warnTxt : COLOR.tinta }, text: r.eta }), el('span', { class: 'n', text: r.arrReal ? 'registrada' : 'con el avance actual' }))),
      el('div', { style: { display: 'flex', 'flex-direction': 'column', gap: '8px' } },
        barra('Programado', r.bars.prog, COLOR.gris2),
        barra('Estimado hoy', r.bars.est, r.bars.est - r.bars.prog > tol ? COLOR.warn : COLOR.acento),
        barra('Prom. 10 viajes', r.bars.avg, '#C9C5BC')),
      el('button', { type: 'button', class: 'enlace solo-admin', style: { 'align-self': 'flex-start' }, text: 'Corregir viaje', onclick: () => editarViaje(r) }));

    // ---- Puntos de abordaje ----
    const listaParadas = el('section', { class: 'tarjeta oculto', style: { 'flex-grow': 1 }, 'aria-label': 'Puntos de abordaje' },
      el('div', { class: 't-enc base', style: { padding: '14px 22px' } }, el('h2', { text: 'Puntos de abordaje' }),
        el('span', { class: 'mini' }, el('span', { class: 'num', style: { color: COLOR.warnTxt, 'font-weight': 700 }, text: miss }), ' omisiones · ',
          el('span', { class: 'num', style: { 'font-weight': 600, color: COLOR.tinta }, text: riders }), ' abordados')),
      el('div', { class: 'lista-scroll' }, stops.map((s) => {
        const c = LOOK[s.vis];
        const late = s.real && s.real > s.prog;
        const fila = el(esAdmin() ? 'button' : 'div', {
          type: esAdmin() ? 'button' : null, class: 'tr',
          style: { 'grid-template-columns': '26px minmax(0,1fr) 50px 50px 30px 84px', gap: '10px', 'min-height': '46px', padding: '4px 22px', 'font-size': '13px', background: s.st === 'omitida' ? '#FFFBF8' : '#fff' },
          onclick: esAdmin() ? () => editarParada(r, s) : null,
        },
          el('div', { class: 'm-parada', style: { width: '24px', height: '24px', 'font-size': '11px', 'border-color': c.border, background: c.bg, color: c.fg, 'box-shadow': 'none' }, text: s.n }),
          el('div', { class: 'dos-lineas' }, el('span', { class: 'recorte', style: { 'font-weight': 500 }, text: s.name }),
            el('span', { style: { 'font-size': '11px', color: s.st === 'omitida' ? COLOR.warnTxt : COLOR.gris2 }, text: s.st === 'omitida' ? s.why || 'Omitida' : s.real ? 'Llegada real' : 'Estimado' })),
          el('span', { class: 'num', style: { color: COLOR.gris }, text: s.prog }),
          el('span', { class: 'num', style: { 'font-weight': 600, color: s.st === 'omitida' ? COLOR.warn : s.real ? (late ? COLOR.warnTxt : COLOR.tinta) : COLOR.gris2 }, text: s.real || (s.st === 'omitida' ? '—' : s.prog) }),
          el('span', { class: 'num', style: { 'text-align': 'right' }, text: s.st === 'ok' ? s.riders ?? '—' : '—' }),
          el('span', { class: `pill ${c.cls}`, style: { 'justify-self': 'end', padding: '2px 8px', 'font-size': '11px', 'font-weight': 700 }, text: c.pill }));
        return fila;
      })));

    // ---- Vías alternas ----
    const a = r.alt;
    const altCard = el('section', { class: 'tarjeta pad', style: { padding: '16px 22px', gap: '12px' }, 'aria-label': 'Vías alternas' },
      el('div', { class: 't-fila', style: { 'align-items': 'center' } }, el('h2', { text: 'Vías alternas' }),
        el('button', { type: 'button', class: 'btn chico sec solo-admin', text: a ? 'Cambiar' : 'Proponer vía', onclick: () => proponerAlterna(r) })),
      a ? el('div', { style: { display: 'flex', 'flex-direction': 'column', gap: '12px' } },
        el('div', { style: { display: 'flex', 'justify-content': 'space-between', 'align-items': 'flex-start', gap: '12px' } },
          el('div', { class: 'dos-lineas', style: { gap: '3px' } }, el('span', { style: { 'font-size': '15px', 'font-weight': 600, color: '#4B3578' }, text: a.via }), el('span', { class: 'mini', text: a.reason })),
          el('div', { style: { display: 'flex', 'flex-direction': 'column', 'align-items': 'flex-end', gap: '2px' } },
            el('span', { class: 'num', style: { 'font-size': '16px', 'font-weight': 700, color: COLOR.acentoOsc }, text: a.save != null ? `${a.save > 0 ? '−' : '+'}${Math.abs(a.save)} min` : '—' }),
            el('span', { class: 'num mini', text: `${a.km != null ? (a.km >= 0 ? '+' : '') + fmt(a.km, 1) + ' km' : ''}${a.eta ? ' · llega ' + a.eta : ''}` }))),
        a.estado === 'enviada' ? el('div', { class: 'nota', style: { background: '#EEF4F5', color: COLOR.acentoOsc }, text: 'Enviada al chofer.' }) :
          el('div', { class: 'solo-admin', style: { display: 'flex', gap: '8px' } },
            el('button', { type: 'button', class: 'btn m', style: { 'flex-grow': 1 }, text: 'Enviar al chofer', onclick: (e) => conBoton(e.currentTarget, async () => { await api('POST', `/api/alternas/${a.id}/enviar`); aviso('Vía alterna enviada.'); mostrar(document.getElementById('vista')); }) }),
            el('button', { type: 'button', class: 'btn m sec', text: 'Descartar', onclick: (e) => conBoton(e.currentTarget, async () => { await api('POST', `/api/alternas/${a.id}/descartar`); aviso('Vía alterna descartada.'); mostrar(document.getElementById('vista')); }) })))
        : el('div', { class: 'caja', style: { 'font-size': '13px', color: COLOR.tinta2 }, text: r.estado === 'por_iniciar' ? 'Sin vías alternas sugeridas. La ruta aún no inicia y no hay incidentes reportados en el trayecto.' : 'Sin vías alternas sugeridas para este viaje.' }));

    const vista = el('div', { class: 'rejilla', style: { 'grid-template-columns': 'minmax(0,1fr) 460px', 'flex-grow': 1 } },
      tarjetaMapa, el('div', { class: 'col' }, tiempo, listaParadas, altCard));
    cont.replaceChildren(cab, vista);
    dibujarMapa(contMapa, r, stops, refresco);
  }

  let vistaGuardada = null;
  function dibujarMapa(contMapa, r, stops) {
    if (mapa) { vistaGuardada = { c: mapa.getCenter(), z: mapa.getZoom() }; mapa.remove(); mapa = null; }
    mapa = mapaBase(contMapa, estado.yo.mapaCentro);
    capa = L.layerGroup().addTo(mapa);

    const conCoords = stops.filter((s) => s.lat != null);
    const pl = r.plant;
    const puntos = conCoords.map((s) => [s.lat, s.lng]);
    const linea = r.sentido === 'ENTRADA' ? [...puntos, ...(pl ? [[pl.lat, pl.lng]] : [])] : [...(pl ? [[pl.lat, pl.lng]] : []), ...puntos];
    const cur = r.cur ? [r.cur.lat, r.cur.lng] : null;

    if (linea.length < 1 && !cur) {
      contMapa.append(el('div', { class: 'sin-coords' }, el('div', {},
        el('strong', { text: 'Faltan coordenadas' }), el('br'),
        'Captura la ubicación de las paradas de esta ruta y de la planta para ver el recorrido en el mapa.',
        esAdmin() ? el('div', { style: { 'margin-top': '10px' } }, el('button', { type: 'button', class: 'btn chico', text: 'Capturar paradas', onclick: () => editarRuta(r) })) : null)));
    }

    // Hecho vs por recorrer: hasta la última parada visitada (+ posición actual)
    const idxUltOk = (() => { let k = -1; stops.forEach((s, i) => { if (s.st !== 'pendiente' && s.lat != null) k = i; }); return k; })();
    const hechos = [];
    if (r.sentido === 'SALIDA' && pl && r.estado !== 'por_iniciar') hechos.push([pl.lat, pl.lng]);
    stops.forEach((s, i) => { if (i <= idxUltOk && s.lat != null) hechos.push([s.lat, s.lng]); });
    if (cur && r.estado === 'en_ruta') hechos.push(cur);
    const restantes = [];
    if (cur && r.estado === 'en_ruta') restantes.push(cur);
    else if (hechos.length) restantes.push(hechos[hechos.length - 1]);
    stops.forEach((s, i) => { if (i > idxUltOk && s.lat != null) restantes.push([s.lat, s.lng]); });
    if (r.sentido === 'ENTRADA' && pl) restantes.push([pl.lat, pl.lng]);

    if (restantes.length > 1) L.polyline(restantes, { color: '#9CC3CC', weight: 6, lineCap: 'round', lineJoin: 'round' }).addTo(capa);
    if (hechos.length > 1) L.polyline(hechos, { color: COLOR.acento, weight: 6, lineCap: 'round', lineJoin: 'round' }).addTo(capa);

    if (r.alt && Array.isArray(r.alt.path) && r.alt.path.length > 1) {
      L.polyline(r.alt.path, { color: '#6B4FA0', weight: 5, dashArray: '10 8', lineCap: 'round' }).addTo(capa);
      const medio = r.alt.path[Math.floor(r.alt.path.length / 2)];
      L.marker(medio, { icon: divIcon(el('div', { class: 'm-via', text: r.alt.via }), [0, -8]), interactive: false }).addTo(capa);
    }
    if (pl) {
      L.circle([pl.lat, pl.lng], { radius: pl.radio, color: COLOR.tinta, weight: 1, fillOpacity: 0.05 }).addTo(capa);
      const nodo = el('div', { class: 'm-planta' }, el('div', { class: 'ic' }, icono('planta', { size: 18, color: '#fff' })), el('div', { class: 'nom', text: r.plantName }));
      L.marker([pl.lat, pl.lng], { icon: divIcon(nodo, [17, 17]), interactive: false }).addTo(capa);
    }
    for (const s of stops) {
      if (s.lat == null) continue;
      const c = LOOK[s.vis];
      const nodo = el('div', { class: 'm-parada', style: { 'border-color': c.border, background: c.bg, color: c.fg }, text: s.n });
      L.marker([s.lat, s.lng], { icon: divIcon(nodo, [13, 13]), title: s.name }).addTo(capa);
    }
    if (cur) {
      const nodo = el('div', { class: 'm-bus' }, el('div', { class: 'circ' }, icono('bus', { size: 16, color: '#fff', grosor: 2.2 })), el('span', { class: 'etq-u', text: r.unit || '' }));
      L.marker(cur, { icon: divIcon(nodo, [18, 18]), zIndexOffset: 1000, interactive: false }).addTo(capa);
    }

    const todo = [...linea, ...(cur ? [cur] : [])];
    if (encuadrado === r.id && vistaGuardada) {
      mapa.setView(vistaGuardada.c, vistaGuardada.z, { animate: false });
    } else if (todo.length) {
      mapa.fitBounds(todo, { padding: [60, 60], maxZoom: 15, animate: false });
      encuadrado = r.id;
    }
    setTimeout(() => mapa && mapa.invalidateSize(), 60);
  }

  // ---------------- Modales (solo admin) ----------------
  function editarParada(r, s) {
    modal(`Parada ${s.n} · ${s.name}`, formulario([
      [{ name: 'estado', label: 'Estado', type: 'select', value: s.st, options: [['ok', 'Abordó'], ['omitida', 'Omitida'], ['pendiente', 'Pendiente']] },
       { name: 'horaReal', label: 'Hora real', type: 'time', value: s.real || '' }],
      [{ name: 'usuarios', label: 'Usuarios que abordaron', type: 'number', min: 0, max: 120, value: s.riders ?? '' },
       { name: 'motivo', label: 'Motivo (si se omitió)', value: s.why || '', maxlength: 120 }],
    ], {
      texto: 'Guardar parada',
      enviar: async (d) => {
        await api('PUT', `/api/viajes/${r.id}/paradas/${s.paradaId}`, { ...d, usuarios: d.usuarios === '' ? null : d.usuarios });
        cerrarModal(); aviso('Parada actualizada.'); mostrar(document.getElementById('vista'));
      },
    }));
  }

  async function editarViaje(r) {
    const [choferes, uni] = await Promise.all([api('GET', '/api/choferes'), api('GET', '/api/unidades')]);
    modal(`Corregir viaje · ${r.name}`, formulario([
      [{ name: 'unidad', label: 'Unidad', type: 'select', value: r.unit || '', options: uni.unidades.map((u) => [u.id, u.id]) },
       { name: 'choferId', label: 'Chofer', type: 'select', value: r.choferId || '', options: [['', 'Sin chofer'], ...choferes.map((c) => [c.id, c.nombre])] }],
      [{ name: 'salidaReal', label: 'Salida real', type: 'time', value: r.depReal !== '—' ? r.depReal : '' },
       { name: 'llegadaReal', label: 'Llegada real', type: 'time', value: r.arrReal || '' }],
      [{ name: 'estado', label: 'Estado', type: 'select', value: r.estado, options: [['por_iniciar', 'Por iniciar'], ['en_ruta', 'En ruta'], ['terminado', 'Terminado'], ['cancelado', 'Cancelado']] }],
    ], {
      enviar: async (d) => {
        await api('PUT', `/api/viajes/${r.id}`, { ...d, choferId: d.choferId || null, salidaReal: d.salidaReal || null, llegadaReal: d.llegadaReal || null });
        cerrarModal(); aviso('Viaje actualizado.'); mostrar(document.getElementById('vista'));
      },
    }));
  }

  function proponerAlterna(r) {
    const puntos = [];
    const contM = el('div', { class: 'mapa', style: { 'min-height': '300px', 'border-radius': '12px', overflow: 'hidden' } });
    const txt = el('span', { class: 'mini', text: 'Haz clic en el mapa para trazar la vía (0 puntos).' });
    const f = formulario([
      { name: 'via', label: 'Vía', required: true, maxlength: 80, placeholder: 'Ej. Libramiento Sur' },
      { name: 'motivo', label: 'Motivo', maxlength: 160, placeholder: 'Ej. Obra con cierre parcial' },
      [{ name: 'ahorroMin', label: 'Ahorro (min)', type: 'number', min: -120, max: 120 }, { name: 'kmExtra', label: 'Km extra', type: 'number', step: 0.1 }],
    ], {
      texto: 'Guardar vía alterna',
      extra: el('div', { style: { display: 'flex', 'flex-direction': 'column', gap: '6px' } }, contM, el('div', { class: 't-fila' }, txt, el('button', { type: 'button', class: 'enlace', text: 'Borrar trazo', onclick: () => { puntos.length = 0; linea.setLatLngs([]); txt.textContent = 'Haz clic en el mapa para trazar la vía (0 puntos).'; } }))),
      enviar: async (d) => {
        await api('POST', `/api/viajes/${r.id}/alternas`, { ...d, ahorroMin: d.ahorroMin || null, kmExtra: d.kmExtra || null, puntos });
        cerrarModal(); aviso('Vía alterna registrada.'); mostrar(document.getElementById('vista'));
      },
    });
    let m2 = null;
    let linea = null;
    modal(`Vía alterna · ${r.name}`, f, { ancho: true, onClose: () => m2 && m2.remove() });
    setTimeout(() => {
      m2 = mapaBase(contM, estado.yo.mapaCentro);
      const refs = r.stops.filter((s) => s.lat != null).map((s) => [s.lat, s.lng]);
      if (r.plant) refs.push([r.plant.lat, r.plant.lng]);
      if (refs.length) { L.polyline(refs, { color: '#9CC3CC', weight: 5 }).addTo(m2); m2.fitBounds(refs, { padding: [30, 30], maxZoom: 15 }); }
      linea = L.polyline([], { color: '#6B4FA0', weight: 5, dashArray: '10 8' }).addTo(m2);
      m2.on('click', (e) => { puntos.push([+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6)]); linea.addLatLng(e.latlng); txt.textContent = `${puntos.length} puntos trazados.`; });
    }, 50);
  }

  async function editarRuta(r) {
    const [rutas, choferes, uni] = await Promise.all([api('GET', '/api/rutas'), api('GET', '/api/choferes'), api('GET', '/api/unidades')]);
    const ruta = rutas.find((x) => x.nombre === r.name && x.cliente === r.client && x.sentido === r.sentido && x.unidad === r.unit) ||
                 rutas.find((x) => x.nombre === r.name && x.cliente === r.client && x.sentido === r.sentido);
    if (!ruta) return aviso('No se encontró la ruta.', true);
    const paradas = ruta.paradas.map((p) => ({ ...p }));
    let activa = 0;
    let m2 = null;
    let capa2 = null;

    const tabla = el('tbody');
    const contM = el('div', { class: 'mapa', style: { 'min-height': '320px', 'border-radius': '12px', overflow: 'hidden' } });

    function repintar() {
      tabla.replaceChildren(...paradas.map((p, i) => {
        const nom = el('input', { class: 'inp', value: p.nombre, maxlength: 80, style: { width: '100%' }, oninput: (e) => (p.nombre = e.target.value) });
        const min = el('input', { class: 'inp', type: 'number', min: 0, max: 300, value: p.min ?? 0, style: { width: '80px' }, oninput: (e) => (p.min = e.target.value) });
        return el('tr', { style: { background: i === activa ? '#EEF4F5' : null } },
          el('td', {}, el('button', { type: 'button', class: 'btn chico ' + (i === activa ? '' : 'sec'), text: String(i + 1), title: 'Elegir para ubicar en el mapa', onclick: () => { activa = i; repintar(); } })),
          el('td', {}, nom), el('td', {}, min),
          el('td', { class: 'num', text: p.lat != null ? `${Number(p.lat).toFixed(5)}, ${Number(p.lng).toFixed(5)}` : 'Sin ubicar' }),
          el('td', {}, el('button', { type: 'button', class: 'enlace', text: 'Quitar', onclick: () => { paradas.splice(i, 1); activa = Math.max(0, Math.min(activa, paradas.length - 1)); repintar(); } })));
      }));
      if (capa2) {
        capa2.clearLayers();
        const pts = paradas.filter((p) => p.lat != null).map((p) => [p.lat, p.lng]);
        if (pts.length > 1) L.polyline(pts, { color: COLOR.acento, weight: 4 }).addTo(capa2);
        paradas.forEach((p, i) => {
          if (p.lat == null) return;
          const n = el('div', { class: 'm-parada', style: { 'border-color': COLOR.acento, background: i === activa ? COLOR.acento : '#fff', color: i === activa ? '#fff' : COLOR.acentoOsc }, text: i + 1 });
          L.marker([p.lat, p.lng], { icon: divIcon(n, [13, 13]) }).addTo(capa2);
        });
      }
    }

    const f = formulario([
      [{ name: 'hora', label: r.sentido === 'ENTRADA' ? 'Llegada a planta' : 'Salida de planta', type: 'time', value: ruta.hora, required: true },
       { name: 'duracionMin', label: 'Duración (min)', type: 'number', min: 5, max: 300, value: ruta.duracion_min, required: true }],
      [{ name: 'unidad', label: 'Unidad asignada', type: 'select', value: ruta.unidad || '', options: [['', 'Sin unidad'], ...uni.unidades.map((u) => [u.id, u.id])] },
       { name: 'choferId', label: 'Chofer', type: 'select', value: ruta.chofer_id || '', options: [['', 'El de la unidad'], ...choferes.map((c) => [c.id, c.nombre])] }],
      [{ name: 'dias', label: 'Días (0=dom … 6=sáb)', value: ruta.dias, maxlength: 13 }, { name: 'activo', label: 'Ruta activa', type: 'checkbox', value: ruta.activo }],
    ], {
      texto: 'Guardar ruta',
      extra: el('div', { style: { display: 'flex', 'flex-direction': 'column', gap: '8px' } },
        el('div', { class: 't-fila' }, el('strong', { text: 'Paradas en orden' }), el('span', { class: 'mini', text: 'Elige una parada y haz clic en el mapa para ubicarla.' })),
        el('table', { class: 'tabla-simple' }, el('thead', {}, el('tr', {}, el('th', { text: '#' }), el('th', { text: 'Nombre' }), el('th', { text: 'Min. desde inicio' }), el('th', { text: 'Ubicación' }), el('th'))), tabla),
        el('button', { type: 'button', class: 'btn chico sec', style: { 'align-self': 'flex-start' }, text: 'Agregar parada', onclick: () => { paradas.push({ nombre: `Parada ${paradas.length + 1}`, lat: null, lng: null, min: 0 }); activa = paradas.length - 1; repintar(); } }),
        contM),
      enviar: async (d) => {
        if (!paradas.length) throw new Error('La ruta necesita al menos una parada.');
        await api('PUT', `/api/rutas/${ruta.id}`, { ...d, unidad: d.unidad || null, choferId: d.choferId || null, paradas });
        cerrarModal(); aviso('Ruta guardada. Los viajes que no han salido se actualizaron.'); mostrar(document.getElementById('vista'));
      },
    });
    modal(`Ruta ${ruta.nombre} · ${ruta.cliente} · ${ruta.sentido.toLowerCase()}`, f, { ancho: true, onClose: () => m2 && m2.remove() });
    setTimeout(() => {
      m2 = mapaBase(contM, estado.yo.mapaCentro);
      capa2 = L.layerGroup().addTo(m2);
      if (r.plant) {
        L.circle([r.plant.lat, r.plant.lng], { radius: r.plant.radio, color: COLOR.tinta, weight: 1 }).addTo(m2);
      }
      const pts = paradas.filter((p) => p.lat != null).map((p) => [p.lat, p.lng]);
      if (r.plant) pts.push([r.plant.lat, r.plant.lng]);
      if (pts.length) m2.fitBounds(pts, { padding: [30, 30], maxZoom: 15 });
      m2.on('click', (e) => {
        if (!paradas[activa]) return;
        paradas[activa].lat = +e.latlng.lat.toFixed(6);
        paradas[activa].lng = +e.latlng.lng.toFixed(6);
        if (activa < paradas.length - 1) activa++;
        repintar();
      });
      repintar();
    }, 50);
    repintar();
  }

  async function abrirGeocercas() {
    const geos = await api('GET', '/api/geocercas');
    let m2 = null;
    let marca = null;
    const contM = el('div', { class: 'mapa', style: { 'min-height': '300px', 'border-radius': '12px', overflow: 'hidden' } });
    const f = formulario([
      [{ name: 'nombre', label: 'Nombre', required: true, maxlength: 80 },
       { name: 'tipo', label: 'Tipo', type: 'select', value: 'PLANTA', options: [['PLANTA', 'Planta'], ['PATIO', 'Patio'], ['GASOLINERA', 'Gasolinera'], ['TALLER', 'Taller'], ['OTRO', 'Otro']] },
       { name: 'cliente', label: 'Cliente (plantas)', maxlength: 40 }],
      [{ name: 'lat', label: 'Latitud', type: 'number', step: 0.000001, required: true }, { name: 'lng', label: 'Longitud', type: 'number', step: 0.000001, required: true },
       { name: 'radioM', label: 'Radio (m)', type: 'number', min: 10, max: 20000, value: 300, required: true }],
      { name: 'enviarSamsara', label: 'Crear también en Samsara', type: 'checkbox', value: false },
    ], {
      texto: 'Guardar geocerca',
      enviar: async (d) => {
        const existente = geos.find((g) => g.nombre.toLowerCase() === d.nombre.toLowerCase());
        if (existente) await api('PUT', `/api/geocercas/${existente.id}`, d);
        else await api('POST', '/api/geocercas', d);
        aviso('Geocerca guardada.'); cerrarModal(); abrirGeocercas();
      },
    });
    const filas = geos.map((g) => el('tr', {},
      el('td', {}, el('strong', { text: g.nombre }), g.lat == null ? el('span', { class: 'pill vig', style: { 'margin-left': '6px' }, text: 'Sin ubicar' }) : null),
      el('td', { text: g.tipo }), el('td', { text: g.cliente || '—' }), el('td', { class: 'num', text: `${g.radio_m} m` }),
      el('td', {}, g.samsara_id ? el('span', { class: 'pill ok', text: 'Samsara' }) : el('span', { class: 'pill gris', text: 'Local' })),
      el('td', {}, el('button', { type: 'button', class: 'enlace', text: 'Editar', onclick: () => {
        f.nombre.value = g.nombre; f.tipo.value = g.tipo; f.cliente.value = g.cliente || ''; f.lat.value = g.lat ?? ''; f.lng.value = g.lng ?? ''; f.radioM.value = g.radio_m;
        if (g.lat != null && m2) { m2.setView([g.lat, g.lng], 15); pintarMarca(); }
      } }), ' ',
        !g.samsara_id && g.lat != null && estado.yo.samsara ? el('button', { type: 'button', class: 'enlace', text: 'Enviar a Samsara', onclick: (e) => conBoton(e.currentTarget, async () => { await api('POST', `/api/geocercas/${g.id}/samsara`); aviso('Creada en Samsara.'); cerrarModal(); abrirGeocercas(); }) }) : null, ' ',
        el('button', { type: 'button', class: 'enlace', style: { color: COLOR.warnTxt }, text: 'Eliminar', onclick: async () => {
          if (!confirm(`¿Eliminar "${g.nombre}"?`)) return;
          const tambien = g.samsara_id ? confirm('¿También eliminarla en Samsara?') : false;
          try { await api('DELETE', `/api/geocercas/${g.id}${tambien ? '?tambienSamsara=1' : ''}`); aviso('Eliminada.'); cerrarModal(); abrirGeocercas(); } catch (e) { aviso(e.message, true); }
        } })))) ;
    function pintarMarca() {
      if (!m2) return;
      if (marca) m2.removeLayer(marca);
      const lat = parseFloat(f.lat.value), lng = parseFloat(f.lng.value), rad = parseFloat(f.radioM.value);
      if (Number.isFinite(lat) && Number.isFinite(lng)) marca = L.circle([lat, lng], { radius: Number.isFinite(rad) ? rad : 200, color: '#1D4ED8', dashArray: '6 4' }).addTo(m2);
    }
    ['lat', 'lng', 'radioM'].forEach((n) => f[n].addEventListener('input', pintarMarca));
    const cuerpo = el('div', { style: { display: 'flex', 'flex-direction': 'column', gap: '14px' } },
      el('div', { class: 't-fila' }, el('span', { class: 'mini', text: 'Las plantas sirven para registrar la llegada automática de cada viaje.' }),
        estado.yo.samsara ? el('button', { type: 'button', class: 'btn chico sec', text: 'Importar desde Samsara', onclick: (e) => conBoton(e.currentTarget, async () => { const x = await api('POST', '/api/geocercas/importar'); aviso(`Importadas ${x.importadas}${x.omitidas ? `, omitidas ${x.omitidas} (polígonos)` : ''}.`); cerrarModal(); abrirGeocercas(); }) }) : null),
      el('table', { class: 'tabla-simple' }, el('thead', {}, el('tr', {}, ['Nombre', 'Tipo', 'Cliente', 'Radio', 'Origen', ''].map((t) => el('th', { text: t })))), el('tbody', {}, filas)),
      el('strong', { text: 'Agregar o editar' }), el('span', { class: 'mini', text: 'Haz clic en el mapa para tomar las coordenadas.' }), contM, f);
    modal('Geocercas', cuerpo, { ancho: true, onClose: () => m2 && m2.remove() });
    setTimeout(() => {
      m2 = mapaBase(contM, estado.yo.mapaCentro);
      const pts = [];
      for (const g of geos) if (g.lat != null) { pts.push([g.lat, g.lng]); L.circle([g.lat, g.lng], { radius: g.radio_m, color: COLOR.watch, weight: 2, fillOpacity: 0.08 }).bindTooltip(g.nombre).addTo(m2); }
      if (pts.length) m2.fitBounds(pts, { padding: [40, 40], maxZoom: 14 });
      m2.on('click', (e) => { f.lat.value = e.latlng.lat.toFixed(6); f.lng.value = e.latlng.lng.toFixed(6); pintarMarca(); });
    }, 50);
  }

  CP.vistas.rutas = { mostrar, salir };
})();

/* Checklist de salida */
(() => {
  'use strict';
  const { el, api, fmt, aviso, COLOR, icono, modal, cerrarModal, formulario, conBoton, fechaCorta, fechaDM, diasHasta, esAdmin, estado } = CP;
  let DEF = null;
  let unidadSel = null;
  let guardarT = null;
  let flush = null;

  function veredicto(st) {
    const blockers = [], notes = [];
    if (st.combustible <= 1) notes.push('Cargar combustible antes de salir');
    for (const f of DEF.FLUIDS) if (st.fluidos[f.id] === 'Bajo') (f.blocks ? blockers : notes).push(`${f.label} bajo`);
    for (const z of DEF.ZONES) { const d = st.danos[z.id]; if (d && d.prev === 'Nuevo' && d.sev === 'Grave') notes.push(`Daño grave nuevo: ${z.name.toLowerCase()}`); }
    for (const c of DEF.CHECKS) if (st.fallas[c.id]) (c.critical ? blockers : notes).push(`Falla: ${c.label.toLowerCase()}`);
    if (blockers.length) return { title: 'No apta para salir', bg: '#FDE7DA', border: '#F3C3A6', fg: '#8A3410', dot: COLOR.warn, blocked: true, reasons: blockers.concat(notes).slice(0, 3) };
    if (notes.length) return { title: 'Apta con observaciones', bg: '#FBF1D9', border: '#EED9A6', fg: '#7A4E0A', dot: COLOR.watch, blocked: false, reasons: notes.slice(0, 3) };
    return { title: 'Apta para salir', bg: '#E3EEF0', border: '#BFD7DC', fg: '#0A4555', dot: COLOR.acento, blocked: false, reasons: ['Todos los puntos en orden'] };
  }

  async function mostrar(cont, param) {
    DEF = DEF || (await api('GET', '/api/checklist/definicion'));
    const uni = await api('GET', '/api/unidades');
    const operables = uni.unidades.filter((u) => u.st !== 'baja');
    if (param) unidadSel = param.toUpperCase();
    if (!operables.some((u) => u.id === unidadSel)) {
      unidadSel = (operables.find((u) => u.st === 'iniciar') || operables.find((u) => u.st === 'ruta') || operables[0])?.id || null;
    }
    if (!unidadSel) { cont.replaceChildren(el('div', { class: 'tarjeta vacio', text: 'No hay unidades operando.' })); return; }
    const d = await api('GET', `/api/checklist?unidad=${encodeURIComponent(unidadSel)}`);
    pintar(cont, d, operables);
  }

  function pintar(cont, d, operables) {
    const info = d.info;
    const cl = d.checklist;
    const editable = esAdmin() && cl && cl.estado === 'borrador';
    const st = cl ? { combustible: cl.combustible, fluidos: { ...cl.fluidos }, fallas: { ...cl.fallas }, danos: { ...cl.danos } } : null;
    const fotosPorZona = {};
    for (const f of d.fotos) (fotosPorZona[f.zona] = fotosPorZona[f.zona] || []).push(f.id);

    const selUnidad = el('select', { class: 'sel', 'aria-label': 'Unidad', onchange: (e) => { location.hash = `#/checklist/${encodeURIComponent(e.target.value)}`; } },
      operables.map((u) => el('option', { value: u.id, selected: u.id === unidadSel, text: `${u.id} · ${u.route}` })));

    function render() {
      const v = st ? veredicto(st) : null;
      const cerrado = cl && cl.estado !== 'borrador';

      const verdictoBox = v ? el('div', { style: { display: 'flex', 'align-items': 'center', gap: '10px', padding: '10px 16px', 'border-radius': '12px', background: v.bg, border: `1px solid ${v.border}` } },
        el('span', { 'aria-hidden': 'true', style: { width: '10px', height: '10px', 'border-radius': '50%', background: v.dot } }),
        el('span', { style: { 'font-size': '15px', 'font-weight': 700, color: v.fg }, text: cerrado ? `${v.title} · ${cl.estado === 'firmado' ? 'firmado' : 'enviado a taller'}` : v.title })) : null;

      const cab = el('div', { class: 'cabecera' },
        el('div', { class: 'tit' }, el('h1', { text: 'Checklist de salida' }),
          el('div', { class: 'sub' }, el('span', { class: 'num', style: { 'font-weight': 600, color: COLOR.tinta }, text: info.unidad }), ` · ${info.chofer}`,
            cl ? [' · iniciado a las ', el('span', { class: 'num', text: cl.iniciado })] : ' · sin iniciar')),
        el('div', { class: 'acciones-cab' }, selUnidad, verdictoBox));

      if (!cl) {
        cont.replaceChildren(cab, el('div', { class: 'tarjeta vacio', text: 'Todavía no hay checklist de hoy para esta unidad.' }));
        return;
      }

      // --- Información relevante ---
      const hoy = estado.yo.hoy;
      const dato = (k, v, n, color, mono = true) => el('div', { class: 'dato' }, el('span', { class: 'k', text: k }), el('span', { class: mono ? 'v num' : 'v', style: color ? { color } : null, text: v }), n ? el('span', { class: 'n', style: color ? { color } : null, text: n }) : null);
      const diasPol = info.poliza ? diasHasta(info.poliza, hoy) : null;
      const colPol = diasPol == null ? null : diasPol < 0 ? COLOR.warnTxt : diasPol <= info.diasAviso ? COLOR.watchTxt : null;
      const diasLic = info.licencia ? diasHasta(info.licencia, hoy) : null;
      const colLic = diasLic == null ? null : diasLic < 0 ? COLOR.warnTxt : diasLic <= info.diasAviso ? COLOR.watchTxt : null;
      const infoCard = el('section', { class: 'tarjeta pad', 'aria-label': 'Información relevante' },
        el('h2', { text: 'Información relevante' }),
        el('div', { class: 'datos2', style: { 'row-gap': '14px' } },
          dato('Unidad', `${info.unidad} · ${info.tipo}`, null, null, false), dato('Chofer', info.chofer, null, null, false), dato('Ruta y cliente', info.ruta, null, null, false), dato('Salida programada', info.salida),
          dato('Odómetro', info.odo != null ? `${fmt(info.odo)} km` : 'Sin dato'),
          dato('Próximo servicio', info.prox != null ? `${fmt(info.prox)} km` : '—', info.prox != null && info.odo != null ? (info.prox - info.odo > 0 ? `faltan ${fmt(info.prox - info.odo)} km` : `vencido ${fmt(info.odo - info.prox)} km`) : null, info.prox != null && info.odo != null && info.prox - info.odo <= 0 ? COLOR.warnTxt : null),
          dato('Licencia federal', info.licencia ? `vence ${fechaCorta(info.licencia)}` : 'Sin capturar', diasLic != null && diasLic <= info.diasAviso ? `en ${diasLic} días` : null, colLic),
          dato('Póliza de seguro', info.polizaNota || (info.poliza ? `vence ${fechaCorta(info.poliza)}` : 'Sin capturar'), diasPol != null && diasPol <= info.diasAviso ? `en ${diasPol} días` : null, colPol),
          dato('Tarjeta de circulación', info.tarjeta || '—', null, null, false),
          dato('Último checklist', info.ultimo ? `${fechaDM(info.ultimo.slice(0, 10))} · ${new Date(info.ultimo).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}` : '—')));

      // --- Niveles ---
      const fuelLow = st.combustible <= 1;
      const niveles = el('section', { class: 'tarjeta pad', style: { gap: '12px', 'flex-grow': 1 }, 'aria-label': 'Niveles' },
        el('h2', { text: 'Niveles' }),
        el('div', { style: { display: 'flex', 'flex-direction': 'column', gap: '8px' } },
          el('div', { class: 't-fila' }, el('span', { style: { 'font-size': '14px', 'font-weight': 500 }, text: 'Combustible' }), el('span', { class: 'num', style: { 'font-size': '13px', 'font-weight': 600, color: fuelLow ? COLOR.warnTxt : COLOR.tinta }, text: DEF.FUEL[st.combustible] })),
          el('div', { role: 'group', 'aria-label': 'Nivel de combustible', style: { display: 'grid', 'grid-template-columns': 'repeat(5, minmax(0,1fr))', gap: '4px' } },
            DEF.FUEL.map((l, i) => {
              const on = i <= st.combustible;
              return el('button', { type: 'button', disabled: !editable, 'aria-pressed': String(i === st.combustible), onclick: () => cambiar({ combustible: i }),
                style: { 'min-height': '36px', 'border-radius': '6px', border: `1px solid ${on ? (fuelLow ? COLOR.warn : COLOR.acento) : COLOR.control}`, background: on ? (fuelLow ? COLOR.warn : COLOR.acento) : '#fff', color: on ? '#fff' : COLOR.gris, 'font-size': '12px', 'font-weight': 600, cursor: editable ? 'pointer' : 'default' }, text: l });
            }))),
        el('div', {}, DEF.FLUIDS.map((f) => el('div', { style: { display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', 'min-height': '44px', 'border-top': `1px solid ${COLOR.borde2}`, gap: '10px' } },
          el('span', { style: { 'font-size': '14px' }, text: f.label }),
          el('div', { class: 'seg-mini', role: 'group', 'aria-label': f.label },
            DEF.LEVELS.map((l) => el('button', { type: 'button', class: l === 'Bajo' ? 'malo' : '', disabled: !editable, 'aria-pressed': String(st.fluidos[f.id] === l), text: l,
              onclick: () => cambiar({ fluidos: { ...st.fluidos, [f.id]: l } }) })))))));

      // --- Daños y golpes ---
      let n = 0;
      const lista = [];
      const zonas = DEF.ZONES.map((z) => {
        const dd = st.danos[z.id];
        let num = 0;
        const isNew = dd && dd.prev === 'Nuevo';
        if (dd) {
          n += 1; num = n;
          lista.push({ z, d: dd, n: num, isNew });
        }
        return el('button', {
          type: 'button', 'aria-pressed': String(Boolean(dd)), 'aria-label': z.name, disabled: !editable,
          onclick: () => editarDano(z),
          style: { position: 'absolute', left: z.x + 'px', top: z.y + 'px', width: z.w + 'px', height: z.h + 'px', 'border-radius': '8px', border: `2px dashed ${dd ? (isNew ? COLOR.warn : COLOR.gris) : '#B5B1A8'}`, background: dd ? (isNew ? 'rgba(194,65,12,0.12)' : 'rgba(91,97,103,0.12)') : 'rgba(255,255,255,0.55)', cursor: editable ? 'pointer' : 'default', display: 'flex', 'flex-direction': 'column', 'align-items': 'center', 'justify-content': 'center', gap: '4px', padding: '2px' },
        },
          dd ? el('span', { class: 'num', style: { width: '22px', height: '22px', 'border-radius': '50%', background: isNew ? COLOR.warn : COLOR.gris, color: '#fff', 'font-size': '12px', 'font-weight': 700, display: 'flex', 'align-items': 'center', 'justify-content': 'center' }, text: num }) : null,
          el('span', { style: { 'font-size': '11px', 'font-weight': 600, color: dd ? COLOR.tinta : COLOR.gris, 'line-height': 1.15, 'text-align': 'center' }, text: z.short }));
      });
      const rueda = (l, t, h) => el('div', { 'aria-hidden': 'true', style: { position: 'absolute', left: l + 'px', top: t + 'px', width: '10px', height: h + 'px', 'border-radius': '3px', background: COLOR.tinta2 } });
      const diagrama = el('div', { style: { position: 'relative', width: '424px', height: '400px', 'align-self': 'center', 'max-width': '100%' } },
        el('div', { 'aria-hidden': 'true', style: { position: 'absolute', left: '132px', top: '16px', width: '160px', height: '368px', 'border-radius': '34px 34px 12px 12px', background: COLOR.borde2, border: '2px solid #C9C5BC' } }),
        rueda(124, 70, 44), rueda(290, 70, 44), rueda(124, 290, 60), rueda(290, 290, 60),
        el('div', { 'aria-hidden': 'true', style: { position: 'absolute', left: 0, top: 0, width: '424px', 'text-align': 'center', 'font-size': '10px', 'font-weight': 700, 'letter-spacing': '1px', color: COLOR.gris2 }, text: 'FRENTE' }),
        zonas);
      const danosCard = el('section', { class: 'tarjeta pad', style: { gap: '12px' }, 'aria-label': 'Daños y golpes' },
        el('div', { class: 't-fila' }, el('h2', { text: 'Daños y golpes' }), el('span', { class: 'mini', text: editable ? 'Toca una zona para marcarla' : 'Solo lectura' })),
        diagrama,
        el('div', { style: { display: 'flex', 'flex-direction': 'column', 'border-top': `1px solid ${COLOR.borde2}` } },
          lista.length ? lista.map(({ z, d: dd, n: num, isNew }) => {
            const grave = dd.sev === 'Grave';
            const fotos = fotosPorZona[z.id] || [];
            return el('div', { style: { display: 'grid', 'grid-template-columns': '24px minmax(0,1fr) auto', gap: '10px', 'align-items': 'center', padding: '9px 0', 'border-bottom': `1px solid ${COLOR.linea || '#F0EEE9'}` } },
              el('span', { class: 'num', style: { width: '22px', height: '22px', 'border-radius': '50%', background: isNew ? COLOR.warn : COLOR.gris, color: '#fff', 'font-size': '12px', 'font-weight': 700, display: 'flex', 'align-items': 'center', 'justify-content': 'center' }, text: num }),
              el('div', { class: 'dos-lineas' }, el('span', { style: { 'font-size': '13px', 'font-weight': 600 }, text: `${z.name} · ${dd.type}` }), el('span', { class: 'recorte', style: { 'font-size': '12px', color: COLOR.gris }, text: dd.desc })),
              el('div', { style: { display: 'flex', gap: '6px', 'align-items': 'center' } },
                el('span', { class: `pill ${isNew ? 'mal' : 'gris'}`, style: { padding: '2px 8px', 'font-size': '11px', 'font-weight': 700 }, text: isNew ? (grave ? 'Nuevo · grave' : 'Nuevo') : dd.prev }),
                fotos.length ? el('button', { type: 'button', class: 'enlace', text: `${fotos.length} foto${fotos.length > 1 ? 's' : ''}`, onclick: () => verFotos(z, fotos) }) : null,
                editable ? el('button', { type: 'button', 'aria-label': 'Agregar foto', title: 'Agregar foto', onclick: () => subirFoto(z), style: { width: '32px', height: '32px', 'border-radius': '8px', border: `1px solid ${COLOR.control}`, background: '#fff', cursor: 'pointer', display: 'flex', 'align-items': 'center', 'justify-content': 'center' } }, icono('camara', { color: COLOR.tinta2 })) : null));
          }) : el('div', { style: { padding: '14px 0', 'font-size': '13px', color: COLOR.gris }, text: 'Sin daños marcados.' })));

      // --- Fallas ---
      const failCount = DEF.CHECKS.filter((c) => st.fallas[c.id]).length;
      const v2 = veredicto(st);
      const fallas = el('section', { class: 'tarjeta pad', style: { gap: '10px' }, 'aria-label': 'Fallas' },
        el('div', { class: 't-fila' }, el('h2', { text: 'Fallas' }), el('span', { class: 'mini' }, el('span', { class: 'num', style: { 'font-weight': 700, color: COLOR.warnTxt }, text: failCount }), ` con falla de ${DEF.CHECKS.length}`)),
        el('div', {}, DEF.CHECKS.map((c) => {
          const failed = Boolean(st.fallas[c.id]);
          return el('div', { style: { display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', 'min-height': '40px', gap: '10px', 'border-bottom': '1px solid #F0EEE9' } },
            el('span', { style: { 'font-size': '13px', display: 'flex', 'align-items': 'center', gap: '6px', 'min-width': 0 } },
              el('span', { class: 'recorte', text: c.label }),
              c.critical ? el('span', { style: { padding: '1px 6px', 'border-radius': '4px', 'font-size': '10px', 'font-weight': 700, background: COLOR.borde2, color: COLOR.tinta2 }, text: 'CRÍTICO' }) : null),
            el('div', { class: 'seg-mini', role: 'group', 'aria-label': c.label },
              el('button', { type: 'button', class: 'ok', disabled: !editable, 'aria-pressed': String(!failed), style: { 'min-width': '56px', 'min-height': '30px' }, text: 'Bien', onclick: () => { const f = { ...st.fallas }; delete f[c.id]; cambiar({ fallas: f }); } }),
              el('button', { type: 'button', class: 'malo', disabled: !editable, 'aria-pressed': String(failed), style: { 'min-width': '56px', 'min-height': '30px' }, text: 'Falla', onclick: () => cambiar({ fallas: { ...st.fallas, [c.id]: true } }) })));
        })),
        el('div', { style: { 'margin-top': 'auto', padding: '14px 16px', 'border-radius': '12px', background: v2.bg, border: `1px solid ${v2.border}`, display: 'flex', 'flex-direction': 'column', gap: '6px' } },
          el('span', { style: { 'font-size': '14px', 'font-weight': 700, color: v2.fg }, text: v2.title }),
          v2.reasons.map((t) => el('span', { style: { 'font-size': '12px', color: v2.fg }, text: `· ${t}` }))),
        cerrado ? el('div', { class: 'nota', style: { background: COLOR.borde2, color: COLOR.tinta2 }, text: cl.estado === 'firmado' ? `Firmado por ${cl.firmadoPor} a las ${new Date(cl.firmadoEn).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}` : 'Unidad enviada a taller.' })
          : el('div', { class: 'solo-admin', style: { display: 'flex', gap: '8px' } },
            el('button', { type: 'button', class: 'btn m', style: { 'flex-grow': 1, 'min-height': '46px' }, disabled: v2.blocked, 'aria-disabled': String(v2.blocked), text: 'Firmar y liberar unidad',
              onclick: (e) => conBoton(e.currentTarget, async () => { await guardarYa(); await api('POST', `/api/checklist/${cl.id}/firmar`); aviso(`${info.unidad} liberada.`); mostrar(cont, info.unidad); }) }),
            el('button', { type: 'button', class: 'btn m sec', style: { 'min-height': '46px' }, text: 'Enviar a taller',
              onclick: (e) => conBoton(e.currentTarget, async () => { if (!confirm(`¿Enviar ${info.unidad} a taller?`)) return; await guardarYa(); await api('POST', `/api/checklist/${cl.id}/taller`); aviso(`${info.unidad} enviada a taller.`); location.hash = `#/mantenimiento/${encodeURIComponent(info.unidad)}`; }) })));

      cont.replaceChildren(cab, el('div', { class: 'rejilla', style: { 'grid-template-columns': '400px minmax(0,1fr) 440px', 'flex-grow': 1 } },
        el('div', { class: 'col' }, infoCard, niveles), danosCard, fallas));
    }

    // ---- Cambios: pinta al instante y guarda en segundo plano ----
    let pendiente = null;
    function cambiar(parcial) {
      Object.assign(st, parcial);
      pendiente = { ...(pendiente || {}), ...parcial };
      render();
      clearTimeout(guardarT);
      guardarT = setTimeout(guardarYa, 400);
    }
    async function guardarYa() {
      clearTimeout(guardarT);
      if (!pendiente) return;
      const body = pendiente;
      pendiente = null;
      try { await api('PUT', `/api/checklist/${cl.id}`, body); } catch (e) { aviso(e.message, true); }
    }

    function editarDano(z) {
      const actual = st.danos[z.id];
      const quitar = actual ? el('button', { type: 'button', class: 'btn m sec', style: { color: COLOR.warnTxt }, text: actual.prev === 'Nuevo' ? 'Quitar marca' : 'Ya fue reparado (quitar)', onclick: () => {
        const nd = { ...st.danos }; delete nd[z.id]; cerrarModal(); cambiar({ danos: nd });
      } }) : null;
      modal(`${z.name}`, formulario([
        [{ name: 'type', label: 'Tipo', type: 'select', value: actual?.type && actual.type !== 'Por describir' ? actual.type : 'Golpe', options: DEF.TIPOS_DANO },
         { name: 'sev', label: 'Severidad', type: 'select', value: actual?.sev && actual.sev !== '—' ? actual.sev : 'Menor', options: DEF.SEVERIDADES }],
        { name: 'desc', label: 'Descripción', maxlength: 160, value: actual && actual.desc !== 'Agregar descripción y foto' ? actual.desc : '', placeholder: 'Ej. Abolladura en puerta de servicio' },
      ], {
        texto: actual ? 'Guardar' : 'Marcar daño',
        extra: quitar,
        enviar: async (dd) => {
          const nd = { ...st.danos, [z.id]: { type: dd.type, sev: dd.sev, desc: dd.desc || 'Sin descripción', prev: actual?.prev || 'Nuevo' } };
          cerrarModal(); cambiar({ danos: nd });
        },
      }));
    }

    function subirFoto(z) {
      const input = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', capture: 'environment' });
      input.addEventListener('change', async () => {
        const file = input.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) return aviso('La foto pesa más de 5 MB.', true);
        try {
          await guardarYa();
          await api('POST', `/api/checklist/${cl.id}/fotos?zona=${z.id}`, undefined, { crudo: file });
          aviso('Foto agregada.');
          mostrar(cont, info.unidad);
        } catch (e) { aviso(e.message, true); }
      });
      input.click();
    }

    function verFotos(z, ids) {
      modal(`Fotos · ${z.name}`, el('div', { style: { display: 'grid', 'grid-template-columns': 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' } },
        ids.map((id) => el('a', { href: `/api/fotos/${id}`, target: '_blank', rel: 'noopener' }, el('img', { src: `/api/fotos/${id}`, alt: `Foto de ${z.name}`, style: { width: '100%', 'border-radius': '10px', display: 'block' } })))), { ancho: true });
    }

    flush = guardarYa;
    render();
  }

  CP.vistas.checklist = { mostrar, salir: () => { if (flush) flush(); } };
})();

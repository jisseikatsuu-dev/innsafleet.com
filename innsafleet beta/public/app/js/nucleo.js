/* =====================================================================
   Núcleo del frontend (vanilla JS)
   - Todo el texto de datos se inserta con textContent (sin innerHTML con datos)
   - Estilos dinámicos por CSSOM (compatible con la CSP estricta)
   ===================================================================== */
window.CP = (() => {
  'use strict';

  const COLOR = {
    acento: '#0F5F73', acentoOsc: '#0A4555', warn: '#C2410C', warnTxt: '#9A3412', watch: '#D69E2E', watchTxt: '#7A4E0A',
    tinta: '#1C1F22', tinta2: '#3A3F44', gris: '#5B6167', gris2: '#8A8F94', control: '#D6D3CC', borde2: '#ECEAE4', claro: '#CFCCC4',
  };

  // ---------- DOM ----------
  function el(tag, props, ...hijos) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'style') for (const [p, val] of Object.entries(v)) { if (val != null) n.style.setProperty(p, String(val)); }
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : String(v));
    }
    for (const h of hijos.flat(Infinity)) {
      if (h == null || h === false) continue;
      n.append(h instanceof Node ? h : document.createTextNode(String(h)));
    }
    return n;
  }
  const $ = (s, r = document) => r.querySelector(s);

  // SVG (iconos fijos del diseño; sin datos del usuario)
  const NS = 'http://www.w3.org/2000/svg';
  function svg(attrs, ...hijos) {
    const n = document.createElementNS(NS, 'svg');
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    for (const h of hijos) n.append(h);
    return n;
  }
  function s(tag, attrs) {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  }
  const ICONOS = {
    mas: () => [s('path', { d: 'M12 5v14M5 12h14' })],
    orden: () => [s('path', { d: 'M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4' })],
    descarga: () => [s('path', { d: 'M12 3v12M7 10l5 5 5-5M5 21h14' })],
    reloj: () => [s('circle', { cx: 12, cy: 12, r: 9 }), s('path', { d: 'M12 7v5l3 2' })],
    camara: () => [s('path', { d: 'M4 8h3l2-3h6l2 3h3v11H4z' }), s('circle', { cx: 12, cy: 13, r: 3.5 })],
    bus: () => [s('rect', { x: 4, y: 3, width: 16, height: 14, rx: 2 }), s('path', { d: 'M4 10h16' }), s('circle', { cx: 8, cy: 20, r: 1.5 }), s('circle', { cx: 16, cy: 20, r: 1.5 })],
    planta: () => [s('path', { d: 'M3 21V10l6 4V10l6 4V6h6v15z' })],
  };
  function icono(nombre, { size = 16, color = 'currentColor', grosor = 2 } = {}) {
    return svg({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, 'stroke-width': grosor, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }, ...ICONOS[nombre]());
  }

  // ---------- Formato ----------
  const nf = (d) => new Intl.NumberFormat('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmt = (n, d = 0) => (n == null || Number.isNaN(Number(n)) ? '—' : nf(d).format(Number(n)));
  const signo = (p) => (p >= 0 ? '+' : '−') + fmt(Math.abs(p), 1) + '%';
  const dinero = (n, d = 0) => (n == null ? '—' : '$' + fmt(n, d));
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const DIAS_LARGO = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  function fechaCorta(iso) { if (!iso) return '—'; const [y, m, d] = iso.slice(0, 10).split('-'); return `${Number(d)} ${MESES[Number(m) - 1]} ${y}`; }
  function fechaDM(iso) { if (!iso) return '—'; const [, m, d] = iso.slice(0, 10).split('-'); return `${Number(d)} ${MESES[Number(m) - 1]}`; }
  function diaSemana(iso) { return new Date(iso.slice(0, 10) + 'T12:00:00Z').getUTCDay(); }
  function fechaLarga(iso) { return `${DIAS_LARGO[diaSemana(iso)]} ${fechaCorta(iso)}`; }
  function fechaEnc(iso) { return `${DIAS[diaSemana(iso)]} ${fechaCorta(iso)}`; }
  function sumarDias(iso, n) { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function diasHasta(iso, hoy) { return Math.round((new Date(iso + 'T12:00:00Z') - new Date(hoy + 'T12:00:00Z')) / 86400000); }
  function hace(iso) {
    if (!iso) return '—';
    const seg = Math.round((Date.now() - new Date(iso)) / 1000);
    if (seg < 60) return `hace ${Math.max(1, seg)} s`;
    if (seg < 3600) return `hace ${Math.round(seg / 60)} min`;
    return `hace ${Math.round(seg / 3600)} h`;
  }
  function horaAhora() { return new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); }
  function iniciales(n) { return String(n || '').split(' ').filter((p) => p && p[0] === p[0].toUpperCase()).slice(0, 2).map((p) => p[0]).join(''); }

  // ---------- Avisos ----------
  let tAviso;
  function aviso(msg, error = false) {
    const a = $('#aviso');
    a.textContent = msg;
    a.classList.toggle('error', error);
    a.hidden = false;
    clearTimeout(tAviso);
    tAviso = setTimeout(() => (a.hidden = true), error ? 7000 : 3500);
  }

  // ---------- API ----------
  async function api(metodo, url, body, { crudo } = {}) {
    const opciones = { method: metodo, credentials: 'same-origin', headers: {} };
    if (crudo) { opciones.body = crudo; opciones.headers['Content-Type'] = crudo.type; }
    else if (body !== undefined) { opciones.body = JSON.stringify(body); opciones.headers['Content-Type'] = 'application/json'; }
    const r = await fetch(url, opciones);
    if (r.status === 401) { location.replace('/login'); throw new Error('Tu sesión terminó.'); }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
    return data;
  }
  async function conBoton(btn, fn) {
    const t = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Un momento…';
    try { return await fn(); } catch (e) { aviso(e.message, true); } finally { btn.disabled = false; btn.textContent = t; }
  }
  function descargar(url) {
    const a = el('a', { href: url, download: '' });
    document.body.append(a); a.click(); a.remove();
  }

  // ---------- Modal ----------
  let alCerrar = null;
  function modal(titulo, contenido, { ancho = false, onClose } = {}) {
    $('#modal-titulo').textContent = titulo;
    $('#modal-cuerpo').replaceChildren(contenido);
    $('.modal').classList.toggle('ancho', ancho);
    $('#modal-fondo').hidden = false;
    alCerrar = onClose || null;
    setTimeout(() => $('#modal-cuerpo input, #modal-cuerpo select, #modal-cuerpo button')?.focus(), 30);
  }
  function cerrarModal() {
    $('#modal-fondo').hidden = true;
    $('#modal-cuerpo').replaceChildren();
    if (alCerrar) { const f = alCerrar; alCerrar = null; f(); }
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#modal-fondo').hidden) cerrarModal(); });
  document.addEventListener('DOMContentLoaded', () => {
    $('#modal-cerrar').addEventListener('click', cerrarModal);
    $('#modal-fondo').addEventListener('click', (e) => { if (e.target.id === 'modal-fondo') cerrarModal(); });
  });

  // Formulario declarativo: campos [{name,label,type,options,value,required,step,min,max}]
  function formulario(campos, { enviar, texto = 'Guardar', extra } = {}) {
    const f = el('form', { class: 'form', novalidate: true });
    const filas = [];
    for (const fila of campos) {
      const grupo = Array.isArray(fila) ? fila : [fila];
      const cont = el('div', { class: grupo.length > 1 ? 'fila' : '' });
      for (const c of grupo) {
        let control;
        if (c.type === 'select') {
          control = el('select', { name: c.name, required: c.required }, (c.options || []).map((o) => {
            const [val, lab] = Array.isArray(o) ? o : [o, o];
            return el('option', { value: val, text: lab, selected: String(val) === String(c.value ?? '') });
          }));
        } else if (c.type === 'textarea') {
          control = el('textarea', { name: c.name, rows: 2, maxlength: c.max || 300 });
          control.value = c.value ?? '';
        } else if (c.type === 'checkbox') {
          control = el('input', { type: 'checkbox', name: c.name, checked: Boolean(c.value) });
          cont.append(el('label', { class: 'campo chk' }, control, c.label));
          continue;
        } else {
          control = el('input', { name: c.name, type: c.type || 'text', required: c.required, step: c.step, min: c.min, max: c.max, maxlength: c.maxlength, placeholder: c.placeholder });
          if (c.value != null) control.value = c.value;
        }
        cont.append(el('label', { class: 'campo' }, c.label, control));
      }
      filas.push(cont);
    }
    const btn = el('button', { type: 'submit', class: 'btn m', text: texto });
    f.append(...filas, extra || null, el('div', { class: 'botones' }, el('button', { type: 'button', class: 'btn m sec', text: 'Cancelar', onclick: cerrarModal }), btn));
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const datos = {};
      for (const c of campos.flat()) {
        const ctl = f.elements[c.name];
        if (!ctl) continue;
        datos[c.name] = c.type === 'checkbox' ? ctl.checked : ctl.value.trim();
        if (c.required && datos[c.name] === '') { aviso(`${c.label} es obligatorio.`, true); ctl.focus(); return; }
      }
      conBoton(btn, () => enviar(datos));
    });
    return f;
  }

  // ---------- Mapa ----------
  function mapaBase(cont, centro) {
    const m = L.map(cont, { zoomControl: false, attributionControl: true }).setView([centro.lat, centro.lng], centro.zoom || 12);
    L.control.zoom({ position: 'topright' }).addTo(m);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
    return m;
  }
  const divIcon = (nodo, ancla) => L.divIcon({ className: '', html: nodo, iconSize: null, iconAnchor: ancla });

  // ---------- Estado global y enrutador ----------
  const estado = { yo: null, vistaActual: null };
  const vistas = {};
  const esAdmin = () => estado.yo?.rol === 'admin';

  function segmentado(opciones, actual, alElegir, { etiqueta } = {}) {
    return el('div', { class: 'seg', role: 'group', 'aria-label': etiqueta || null },
      opciones.map((o) => {
        const [val, lab, cuenta] = Array.isArray(o) ? o : [o, o];
        return el('button', { type: 'button', 'aria-pressed': String(val === actual), onclick: () => alElegir(val) },
          lab, cuenta != null ? el('span', { class: 'cuenta', text: cuenta }) : null);
      }));
  }

  function kpi({ et, valor, unidad, pie, alerta, href, color }) {
    const v = el('span', { class: 'num', text: valor, style: color ? { color } : null });
    return el(href ? 'a' : 'div', { class: `kpi${alerta ? ' alerta' : ''}`, href: href || null },
      el('span', { class: 'et', text: et }),
      el('span', { class: 'valor' }, v, unidad ? el('span', { class: 'unidad-k', text: unidad }) : null),
      pie != null ? el('span', { class: 'pie' }, pie) : null);
  }

  return {
    COLOR, el, $, icono, fmt, signo, dinero, fechaCorta, fechaDM, fechaLarga, fechaEnc, sumarDias, diasHasta, diaSemana, hace, horaAhora, iniciales,
    aviso, api, conBoton, descargar, modal, cerrarModal, formulario, mapaBase, divIcon, estado, vistas, esAdmin, segmentado, kpi,
  };
})();

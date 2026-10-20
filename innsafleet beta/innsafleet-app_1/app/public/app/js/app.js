/* Arranque y enrutador por hash: #/vista/parametro */
(() => {
  'use strict';
  const { $, el, api, aviso, estado, vistas, fechaEnc } = CP;

  function pintarEncabezado() {
    const yo = estado.yo;
    $('#empresa').textContent = yo.empresa;
    document.title = yo.empresa;
    $('#fecha-hoy').textContent = fechaEnc(yo.hoy);
    const p = $('#estado-samsara');
    p.replaceChildren(el('span', { class: 'punto' }), yo.samsara ? 'Samsara en vivo' : 'Sin Samsara');
    p.classList.toggle('apagado', !yo.samsara);
    p.title = yo.samsara ? 'GPS y combustible en tiempo real' : 'Agrega SAMSARA_API_TOKEN para ver datos en vivo';
    $('#quien').replaceChildren(el('b', { text: yo.usuario }), yo.rol === 'admin' ? '' : ' · solo lectura');
    document.body.classList.toggle('invitado', yo.rol !== 'admin');
  }

  async function navegar() {
    const partes = location.hash.replace(/^#\/?/, '').split('/');
    const nombre = vistas[partes[0]] ? partes[0] : 'inicio';
    const param = partes.slice(1).map(decodeURIComponent).join('/') || null;

    if (estado.vistaActual?.salir) { try { estado.vistaActual.salir(); } catch { /* noop */ } }
    document.querySelectorAll('.menu a').forEach((a) => a.setAttribute('aria-current', a.dataset.vista === nombre ? 'page' : 'false'));
    const cont = $('#vista');
    cont.replaceChildren(el('div', { class: 'vacio', text: 'Cargando…' }));
    estado.vistaActual = vistas[nombre];
    try {
      await vistas[nombre].mostrar(cont, param);
    } catch (e) {
      cont.replaceChildren(el('div', { class: 'vacio', text: e.message }));
      aviso(e.message, true);
    }
    cont.focus({ preventScroll: true });
  }

  $('#btn-salir').addEventListener('click', async () => {
    try { await api('POST', '/logout'); } finally { location.replace('/login'); }
  });

  window.addEventListener('hashchange', navegar);
  (async () => {
    try {
      estado.yo = await api('GET', '/api/me');
    } catch (e) {
      aviso(e.message, true);
      return;
    }
    pintarEncabezado();
    if (!location.hash) history.replaceState(null, '', '#/inicio');
    navegar();
  })();
})();

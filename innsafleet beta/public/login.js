document.getElementById('form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('btn');
  const error = document.getElementById('error');
  const usuario = document.getElementById('usuario').value.trim();
  const password = document.getElementById('password').value;
  error.textContent = '';
  if (!usuario || !password) {
    error.textContent = 'Escribe usuario y contraseña.';
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Entrando…';
  try {
    const r = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ usuario, password }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'No se pudo entrar.');
    window.location.replace('/');
  } catch (err) {
    error.textContent = err.message;
    document.getElementById('password').value = '';
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
});

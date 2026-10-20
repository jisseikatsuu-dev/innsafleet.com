// Genera el hash bcrypt de una contraseña para pegarlo en el .env / Variables de Railway.
//
// Uso:
//   npm run generar-password -- "contraseña"          -> ADMIN_PASSWORD_HASH
//   npm run generar-password -- "contraseña" GUEST    -> GUEST_PASSWORD_HASH
//
// Nunca subas la contraseña en texto plano a GitHub: solo el hash va en las
// variables de entorno (y el .env está en .gitignore).

const bcrypt = require('bcryptjs');

const password = process.argv[2];
const destino = (process.argv[3] || 'ADMIN').toUpperCase();

if (!password) {
  console.error('Uso: npm run generar-password -- "contraseña" [ADMIN|GUEST]');
  process.exit(1);
}
if (password.length < 8) {
  console.error('La contraseña debe tener al menos 8 caracteres.');
  process.exit(1);
}
if (!['ADMIN', 'GUEST'].includes(destino)) {
  console.error('El segundo parámetro debe ser ADMIN o GUEST.');
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 12);
console.log('\nCopia esta línea completa en tu .env (o en Variables de Railway):\n');
console.log(`${destino}_PASSWORD_HASH=${hash}\n`);

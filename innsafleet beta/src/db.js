require('dotenv').config();
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('Falta DATABASE_URL en las variables de entorno.');
  process.exit(1);
}

const usaSSL =
  process.env.DATABASE_SSL === 'true' ||
  /railway|rds\.amazonaws|render\.com|supabase/.test(process.env.DATABASE_URL);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: usaSSL ? { rejectUnauthorized: false } : false,
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => console.error('[db] Error en cliente inactivo:', err.message));

module.exports = pool;

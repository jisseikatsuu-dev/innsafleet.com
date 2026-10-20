// pm2 · Control de Patio en EC2
//   pm2 start ecosystem.config.js     (desde la carpeta app/)
//   pm2 save && pm2 startup           (arranca solo al reiniciar la instancia)
module.exports = {
  apps: [
    {
      // Servidor web + monitor de Samsara. Una sola instancia: el monitor no debe correr dos veces.
      name: 'control-patio',
      script: 'src/server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '400M',
      env: { NODE_ENV: 'production' },
      out_file: 'logs/app.log',
      error_file: 'logs/app-error.log',
      time: true,
    },
    {
      // Reporte de combustible de Samsara cada hora (reemplaza el cron).
      name: 'control-patio-sync',
      script: 'scripts/sync-samsara.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: false,
      cron_restart: '5 * * * *',
      env: { NODE_ENV: 'production' },
      out_file: 'logs/sync.log',
      error_file: 'logs/sync-error.log',
      time: true,
    },
  ],
};

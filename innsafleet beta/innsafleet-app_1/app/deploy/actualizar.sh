#!/usr/bin/env bash
# Actualiza el servidor con lo último de main.
#   bash deploy/actualizar.sh          (desde la carpeta app/)
set -euo pipefail
cd "$(dirname "$0")/.."

git pull --ff-only origin main
npm ci --omit=dev
npm run check
npm run seed            # crea tablas nuevas si las hay; no pisa lo capturado
pm2 reload ecosystem.config.js --update-env
pm2 save
echo "✔ Control de Patio actualizado"

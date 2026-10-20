# Despliegue en AWS EC2

Guía para Ubuntu 24.04 con nginx, HTTPS de Let's Encrypt, PostgreSQL y pm2.
Todo se corre como el usuario `ubuntu`, con el repo en `/home/ubuntu/innsafleet.com`.

## 1. Instancia y red

- Instancia `t3.small` o mayor, con una **Elastic IP**.
- Security group: **22** solo desde tu IP, **80** y **443** abiertos. El puerto 3000 **no** se abre: solo nginx habla con la app.
- DNS: registros `A` de `innsafleet.com` y `www.innsafleet.com` apuntando a la Elastic IP.

## 2. Paquetes

```bash
sudo apt update && sudo apt -y upgrade
sudo timedatectl set-timezone America/Monterrey
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt -y install nodejs git nginx postgresql certbot python3-certbot-nginx
sudo npm install -g pm2
```

## 3. Base de datos

**PostgreSQL en la misma instancia:**

```bash
sudo -u postgres psql -c "CREATE USER patio WITH PASSWORD 'cambia-esta-contraseña';"
sudo -u postgres psql -c "CREATE DATABASE control_patio OWNER patio;"
```

En `.env`: `DATABASE_URL=postgresql://patio:cambia-esta-contraseña@localhost:5432/control_patio` y `DATABASE_SSL=false`.

**Con RDS:** usa el endpoint de RDS en `DATABASE_URL`; el SSL se activa solo. El security group de RDS debe aceptar el 5432 solo desde el security group de esta instancia.

## 4. Código y variables

Si el repo es privado, agrega una *deploy key* (solo lectura) de la instancia en GitHub.

```bash
cd ~
git clone git@github.com:jisseikatsuu-dev/innsafleet.com.git
cd innsafleet.com/app
cp .env.example .env
npm ci --omit=dev

npm run generar-password -- "contraseña_admin"            # → ADMIN_PASSWORD_HASH
npm run generar-password -- "contraseña_invitado" GUEST   # → GUEST_PASSWORD_HASH
openssl rand -hex 32                                       # → SESSION_SECRET
nano .env
chmod 600 .env
```

Valores para EC2 con nginx y HTTPS:

```
NODE_ENV=production
TRUST_PROXY=1
SESSION_SECURE=true
ORIGENES_PERMITIDOS=innsafleet.com,www.innsafleet.com
```

Llena también `SAMSARA_API_TOKEN` y, si usas el webhook, `SAMSARA_WEBHOOK_SECRET`.

## 5. Primer arranque

```bash
npm run seed
mkdir -p logs
pm2 start ecosystem.config.js
pm2 save
pm2 startup        # copia y corre el comando sudo que imprime
curl -s localhost:3000/salud    # → {"ok":true}
```

`ecosystem.config.js` levanta dos procesos:

| Proceso | Qué hace |
|---|---|
| `control-patio` | Servidor web y monitor de GPS (una sola instancia) |
| `control-patio-sync` | Reporte de combustible de Samsara cada hora, al minuto 5 |

## 6. nginx y HTTPS

```bash
sudo cp deploy/nginx-innsafleet.conf /etc/nginx/sites-available/innsafleet
sudo ln -s /etc/nginx/sites-available/innsafleet /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d innsafleet.com -d www.innsafleet.com --redirect
```

La configuración pasa `Host` y `X-Forwarded-Proto` a la app. Sin esas dos cabeceras el login funciona pero todo lo que guarda responde 403 (origen no permitido), o la sesión no se mantiene.

## 7. Webhook de Samsara (opcional)

En Samsara crea un webhook de *Geofence Entry/Exit* hacia `https://innsafleet.com/webhooks/samsara` y pon su secret en `SAMSARA_WEBHOOK_SECRET`. Luego `pm2 reload control-patio --update-env`.

## 8. Actualizar

```bash
cd ~/innsafleet.com/app
bash deploy/actualizar.sh
```

Hace `git pull`, instala dependencias, revisa sintaxis, corre `seed` (sin pisar lo capturado) y recarga pm2.

## 9. Respaldo diario de la base

```bash
mkdir -p ~/respaldos
crontab -e
```

```
30 3 * * * pg_dump "postgresql://patio:cambia-esta-contraseña@localhost:5432/control_patio" | gzip > ~/respaldos/patio-$(date +\%F).sql.gz && find ~/respaldos -name '*.sql.gz' -mtime +14 -delete
```

Guarda 14 días. Para tener copia fuera de la instancia, súbelos a S3 con `aws s3 cp`.

## Comandos útiles

```bash
pm2 status
pm2 logs control-patio --lines 100
pm2 logs control-patio-sync --lines 50
pm2 reload control-patio --update-env   # después de cambiar .env
sudo tail -f /var/log/nginx/error.log
```

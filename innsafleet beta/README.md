# Control de Patio

Sistema de patio para las rutas de personal (LINAMAR, MODINE, WIEGAND, CLS) con las 7 pantallas del diseño:

| Pantalla | Qué hace |
|---|---|
| **Inicio** (Panel general) | Unidades en ruta, usuarios a bordo, retrasos, puntualidad de ayer, disponibilidad, rendimiento, operación en vivo, estado de flota, puntualidad de la semana, alertas y checklists del día |
| **Rutas** (Recorrido) | Mapa real (Leaflet) con recorrido hecho / por recorrer, paradas, planta, unidad en vivo, tiempo de ruta (programado / estimado / promedio de 10 viajes), puntos de abordaje con omisiones, vías alternas (proponer, enviar, descartar), editor de paradas y geocercas |
| **Unidades** | Lista con filtro por estado, próximo servicio, km/L, ficha con documentos, checklist y neumáticos de hoy; alta y edición de unidades y choferes |
| **Combustible** | km/L por unidad contra su meta, 8 semanas, ralentí, detalle con gráfica semanal, excesos, cargas y costo; captura de cargas y exportación CSV |
| **Reportes** | Reporte de cliente por día: viajes, usuarios, puntualidad, retardos por chofer, usuarios por turno, descarga CSV |
| **Mantenimiento** | Ingresos a taller, daño grave/permanente, neumáticos (diagrama de 6 llantas mm/psi) y alertas |
| **Checklist** | Checklist de salida: niveles, daños por zona con fotos, fallas críticas, veredicto, firmar y liberar o enviar a taller |

## 1. Rellena los huecos

Todo lo que dice **`▶ RELLENAR`** está en `config/flota.js`:

- Precio del diésel y reglas (tolerancia de retardo, meta de puntualidad, mm de llantas, etc.).
- Datos de cada unidad (año, placas, tanque, vencimiento de póliza). **El nombre de la unidad debe ser idéntico al de Samsara.**
- Choferes.
- Coordenadas de cada planta y del patio.
- Duración y **paradas con coordenadas** de cada ruta (ya vienen cargadas las 51 asignaciones de tu hoja).

Las paradas y plantas también se pueden capturar desde el sistema: *Rutas → Editar ruta* (clic en el mapa) y *Rutas → Geocercas*.

## 2. Instalación local

```bash
npm install
cp .env.example .env
npm run generar-password -- "tu_contraseña_admin"          # pega el resultado en ADMIN_PASSWORD_HASH
npm run generar-password -- "contraseña_invitado" GUEST     # pega el resultado en GUEST_PASSWORD_HASH
openssl rand -hex 32                                        # pega en SESSION_SECRET
npm run seed
npm start
```

> La contraseña del invitado **no está en el repositorio**: solo se guarda su hash en la variable `GUEST_PASSWORD_HASH`. El invitado ve todo y no puede modificar nada (el servidor responde 403).

## 3. Samsara

Token en *Settings → API Tokens* con permisos de lectura de **Vehicles**, **Vehicle Statistics**, **Fuel & Energy** y lectura/escritura de **Addresses** (geocercas).

- **Tiempo real:** el servidor lee GPS, % de tanque, odómetro y motor cada `MONITOR_SEG` segundos. Con eso marca paradas visitadas, omisiones, salida, llegada a planta, ETA, km recorridos, odómetros y excesos de velocidad.
- **Combustible:** botón *Traer datos de Samsara* o `npm run sync` (reporte fuel-energy diario). Sugerido en cron cada hora:
  `0 * * * * cd /ruta/control-patio && npm run sync`
- **Geocercas:** se crean localmente y se pueden enviar/importar de Samsara (*Rutas → Geocercas*).
- **Webhook de llegada (opcional, más exacto):** en Samsara crea un webhook de *Geofence Entry/Exit* hacia `https://TU_DOMINIO/webhooks/samsara` y pon su secret en `SAMSARA_WEBHOOK_SECRET`. Se verifica la firma HMAC.

## 4. Despliegue

**Railway:** conecta el repo, agrega PostgreSQL, copia las variables de `.env.example`, `SESSION_SECURE=true`, `TRUST_PROXY=1`. Ejecuta una vez `npm run seed`.

**AWS EC2:** Node 20+, PostgreSQL (o RDS), nginx con HTTPS delante, `pm2 start src/server.js --name control-patio`, cron de `npm run sync`.

Si corres varias réplicas, deja el monitor en una sola (`MONITOR_DESACTIVADO=true` en las demás).

## Seguridad incluida

Contraseñas con bcrypt y comparación en tiempo constante · sesiones en PostgreSQL con cookie httpOnly/sameSite strict y regeneración al entrar · límite de intentos de login por IP y por usuario · roles admin / invitado validados en el servidor · CSP estricta (sin scripts ni estilos en línea, sin CDNs; fuentes y Leaflet servidos localmente) con Helmet · protección CSRF por origen · validación de todas las entradas y consultas parametrizadas · fotos validadas por firma de archivo (JPG/PNG/WEBP, 5 MB) · CSV protegido contra inyección de fórmulas · webhook con firma HMAC · errores sin detalles internos · bitácora de auditoría de cada cambio.

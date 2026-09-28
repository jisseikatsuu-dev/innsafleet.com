-- =====================================================================
-- Control de Patio — esquema PostgreSQL (idempotente: se puede correr varias veces)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Catálogos
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS choferes (
  id              SERIAL PRIMARY KEY,
  nombre          TEXT NOT NULL UNIQUE,
  telefono        TEXT NOT NULL DEFAULT '',
  licencia_vence  DATE,
  activo          BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS unidades (
  unidad                 TEXT PRIMARY KEY,               -- nombre exacto en Samsara (ej. TP49)
  samsara_id             TEXT UNIQUE,
  tipo                   TEXT NOT NULL DEFAULT 'Sprinter',
  capacidad              INTEGER CHECK (capacidad IS NULL OR capacidad BETWEEN 1 AND 120),
  anio                   INTEGER CHECK (anio IS NULL OR anio BETWEEN 1980 AND 2100),
  placas                 TEXT NOT NULL DEFAULT '',
  cliente                TEXT NOT NULL DEFAULT '',
  chofer_id              INTEGER REFERENCES choferes(id) ON DELETE SET NULL,
  -- estado base: operando / taller / baja  (en ruta, por iniciar y en patio salen de los viajes del día)
  estado                 TEXT NOT NULL DEFAULT 'operando' CHECK (estado IN ('operando', 'taller', 'baja')),
  nota                   TEXT NOT NULL DEFAULT '',
  odometro_km            NUMERIC(10,1),
  prox_servicio_km       NUMERIC(10,1),
  meta_kml               NUMERIC(6,2) CHECK (meta_kml IS NULL OR meta_kml > 0),
  tanque_litros          NUMERIC(7,1) CHECK (tanque_litros IS NULL OR tanque_litros > 0),
  psi_objetivo           INTEGER CHECK (psi_objetivo IS NULL OR psi_objetivo BETWEEN 20 AND 200),
  poliza_vence           DATE,
  poliza_nota            TEXT NOT NULL DEFAULT '',
  tarjeta_circulacion    TEXT NOT NULL DEFAULT 'Vigente',
  verificacion           TEXT NOT NULL DEFAULT 'Vigente',
  activo                 BOOLEAN NOT NULL DEFAULT true,
  actualizado_en         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Geocercas: plantas, patio, gasolinera… (espejo opcional de "addresses" de Samsara)
CREATE TABLE IF NOT EXISTS geocercas (
  id              SERIAL PRIMARY KEY,
  samsara_id      TEXT UNIQUE,
  nombre          TEXT NOT NULL UNIQUE,
  tipo            TEXT NOT NULL DEFAULT 'OTRO' CHECK (tipo IN ('PLANTA', 'PATIO', 'GASOLINERA', 'TALLER', 'OTRO')),
  cliente         TEXT NOT NULL DEFAULT '',
  lat             DOUBLE PRECISION CHECK (lat IS NULL OR (lat BETWEEN -90 AND 90)),
  lng             DOUBLE PRECISION CHECK (lng IS NULL OR (lng BETWEEN -180 AND 180)),
  radio_m         INTEGER NOT NULL DEFAULT 200 CHECK (radio_m BETWEEN 10 AND 20000),
  activo          BOOLEAN NOT NULL DEFAULT true,
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Rutas, paradas y viajes
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rutas (
  id             SERIAL PRIMARY KEY,
  nombre         TEXT NOT NULL,                      -- colonia / nombre de la ruta
  cliente        TEXT NOT NULL,
  sentido        TEXT NOT NULL CHECK (sentido IN ('ENTRADA', 'SALIDA')),
  hora           TIME NOT NULL,                      -- ENTRADA: llegada a planta · SALIDA: salida de planta
  duracion_min   INTEGER NOT NULL DEFAULT 45 CHECK (duracion_min BETWEEN 5 AND 300),
  unidad         TEXT REFERENCES unidades(unidad) ON UPDATE CASCADE ON DELETE SET NULL,
  chofer_id      INTEGER REFERENCES choferes(id) ON DELETE SET NULL,
  dias           TEXT NOT NULL DEFAULT '1,2,3,4,5,6', -- días que opera (0=domingo … 6=sábado)
  activo         BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (cliente, sentido, hora, nombre)
);

CREATE TABLE IF NOT EXISTS paradas (
  id                SERIAL PRIMARY KEY,
  ruta_id           INTEGER NOT NULL REFERENCES rutas(id) ON DELETE CASCADE,
  orden             INTEGER NOT NULL,
  nombre            TEXT NOT NULL,
  lat               DOUBLE PRECISION,
  lng               DOUBLE PRECISION,
  min_desde_inicio  INTEGER NOT NULL DEFAULT 0,
  UNIQUE (ruta_id, orden)
);

CREATE TABLE IF NOT EXISTS viajes (
  id               SERIAL PRIMARY KEY,
  fecha            DATE NOT NULL,
  ruta_id          INTEGER NOT NULL REFERENCES rutas(id) ON DELETE CASCADE,
  unidad           TEXT REFERENCES unidades(unidad) ON UPDATE CASCADE ON DELETE SET NULL,
  chofer_id        INTEGER REFERENCES choferes(id) ON DELETE SET NULL,
  salida_prog      TIMESTAMPTZ NOT NULL,
  llegada_prog     TIMESTAMPTZ NOT NULL,
  salida_real      TIMESTAMPTZ,
  llegada_real     TIMESTAMPTZ,
  estado           TEXT NOT NULL DEFAULT 'por_iniciar' CHECK (estado IN ('por_iniciar', 'en_ruta', 'terminado', 'cancelado')),
  usuarios         INTEGER NOT NULL DEFAULT 0 CHECK (usuarios >= 0),
  km               NUMERIC(8,2),
  ultimo_gps       JSONB,
  eta              TIMESTAMPTZ,
  UNIQUE (fecha, ruta_id)
);
CREATE INDEX IF NOT EXISTS idx_viajes_fecha ON viajes (fecha, estado);

CREATE TABLE IF NOT EXISTS viaje_paradas (
  viaje_id     INTEGER NOT NULL REFERENCES viajes(id) ON DELETE CASCADE,
  parada_id    INTEGER NOT NULL REFERENCES paradas(id) ON DELETE CASCADE,
  hora_prog    TIMESTAMPTZ NOT NULL,
  hora_real    TIMESTAMPTZ,
  usuarios     INTEGER CHECK (usuarios IS NULL OR usuarios >= 0),
  estado       TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'ok', 'omitida')),
  motivo       TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (viaje_id, parada_id)
);

CREATE TABLE IF NOT EXISTS vias_alternas (
  id          SERIAL PRIMARY KEY,
  viaje_id    INTEGER NOT NULL REFERENCES viajes(id) ON DELETE CASCADE,
  via         TEXT NOT NULL,
  motivo      TEXT NOT NULL DEFAULT '',
  ahorro_min  INTEGER,
  km_extra    NUMERIC(6,1),
  puntos      JSONB NOT NULL DEFAULT '[]',          -- [[lat,lng],...]
  estado      TEXT NOT NULL DEFAULT 'sugerida' CHECK (estado IN ('sugerida', 'enviada', 'descartada')),
  creado_por  TEXT NOT NULL,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Combustible
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cargas (
  id              SERIAL PRIMARY KEY,
  unidad          TEXT NOT NULL REFERENCES unidades(unidad) ON UPDATE CASCADE,
  fecha_hora      TIMESTAMPTZ NOT NULL,
  litros          NUMERIC(8,2) NOT NULL CHECK (litros > 0 AND litros <= 2000),
  odometro_km     NUMERIC(10,1) CHECK (odometro_km IS NULL OR odometro_km >= 0),
  precio_litro    NUMERIC(8,3) CHECK (precio_litro IS NULL OR precio_litro >= 0),
  tanque_lleno    BOOLEAN NOT NULL DEFAULT true,
  estacion        TEXT NOT NULL DEFAULT '',
  capturado_por   TEXT NOT NULL,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cargas_unidad_fecha ON cargas (unidad, fecha_hora);

-- Resumen diario por vehículo (Samsara /fleet/reports/vehicles/fuel-energy)
CREATE TABLE IF NOT EXISTS rendimiento_diario (
  fecha           DATE NOT NULL,
  samsara_id      TEXT NOT NULL,
  unidad          TEXT,
  distancia_km    NUMERIC(10,2) NOT NULL DEFAULT 0,
  litros          NUMERIC(10,2) NOT NULL DEFAULT 0,
  horas_motor     NUMERIC(8,2) NOT NULL DEFAULT 0,
  horas_ralenti   NUMERIC(8,2) NOT NULL DEFAULT 0,
  costo_estimado  NUMERIC(12,2),
  moneda          TEXT,
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (fecha, samsara_id)
);
CREATE INDEX IF NOT EXISTS idx_rend_unidad ON rendimiento_diario (unidad, fecha);

-- Excesos de velocidad (los detecta el monitor con el GPS de Samsara)
CREATE TABLE IF NOT EXISTS excesos_velocidad (
  id         SERIAL PRIMARY KEY,
  unidad     TEXT NOT NULL REFERENCES unidades(unidad) ON UPDATE CASCADE ON DELETE CASCADE,
  tiempo     TIMESTAMPTZ NOT NULL,
  kmh        NUMERIC(5,1) NOT NULL,
  limite_kmh NUMERIC(5,1),
  ubicacion  TEXT NOT NULL DEFAULT '',
  UNIQUE (unidad, tiempo)
);

CREATE TABLE IF NOT EXISTS lecturas_samsara (
  samsara_id  TEXT NOT NULL,
  tipo        TEXT NOT NULL CHECK (tipo IN ('fuelPercent', 'obdOdometerMeters', 'gpsOdometerMeters', 'engineState')),
  tiempo      TIMESTAMPTZ NOT NULL,
  valor_num   NUMERIC,
  valor_txt   TEXT,
  PRIMARY KEY (samsara_id, tipo, tiempo)
);
CREATE INDEX IF NOT EXISTS idx_lecturas_tiempo ON lecturas_samsara (tiempo);

-- ---------------------------------------------------------------------
-- Mantenimiento
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS taller (
  id               SERIAL PRIMARY KEY,
  unidad           TEXT NOT NULL REFERENCES unidades(unidad) ON UPDATE CASCADE ON DELETE CASCADE,
  motivo           TEXT NOT NULL,
  taller           TEXT NOT NULL DEFAULT 'Taller interno',
  tipo             TEXT NOT NULL CHECK (tipo IN ('Preventivo', 'Correctivo')),
  ingreso          DATE NOT NULL,
  salida_estimada  DATE,
  salida_real      DATE,
  estado           TEXT NOT NULL DEFAULT 'Diagnóstico' CHECK (estado IN ('Diagnóstico', 'Esperando refacción', 'En reparación', 'Listo hoy', 'Cerrado')),
  creado_por       TEXT NOT NULL,
  creado_en        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_taller_abierto ON taller (estado) WHERE estado <> 'Cerrado';

CREATE TABLE IF NOT EXISTS danos_graves (
  id           SERIAL PRIMARY KEY,
  unidad       TEXT NOT NULL REFERENCES unidades(unidad) ON UPDATE CASCADE ON DELETE CASCADE,
  nivel        TEXT NOT NULL CHECK (nivel IN ('Grave', 'Permanente')),
  titulo       TEXT NOT NULL,
  detalle      TEXT NOT NULL DEFAULT '',
  fecha        DATE NOT NULL,
  seguimiento  TEXT NOT NULL DEFAULT '',
  cobertura    TEXT NOT NULL DEFAULT '',
  cerrado      BOOLEAN NOT NULL DEFAULT false,
  creado_por   TEXT NOT NULL
);

-- posicion: 0 Del. izq · 1 Del. der · 2 Tras. izq. ext · 3 Tras. izq. int · 4 Tras. der. int · 5 Tras. der. ext
CREATE TABLE IF NOT EXISTS neumaticos (
  unidad    TEXT NOT NULL REFERENCES unidades(unidad) ON UPDATE CASCADE ON DELETE CASCADE,
  posicion  INTEGER NOT NULL CHECK (posicion BETWEEN 0 AND 5),
  mm        NUMERIC(4,1) NOT NULL CHECK (mm BETWEEN 0 AND 30),
  psi       INTEGER NOT NULL CHECK (psi BETWEEN 0 AND 200),
  revisado  DATE NOT NULL,
  PRIMARY KEY (unidad, posicion)
);

-- ---------------------------------------------------------------------
-- Checklist de salida
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS checklists (
  id           SERIAL PRIMARY KEY,
  unidad       TEXT NOT NULL REFERENCES unidades(unidad) ON UPDATE CASCADE ON DELETE CASCADE,
  fecha        DATE NOT NULL,
  chofer_id    INTEGER REFERENCES choferes(id) ON DELETE SET NULL,
  iniciado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
  combustible  INTEGER NOT NULL DEFAULT 4 CHECK (combustible BETWEEN 0 AND 4),
  fluidos      JSONB NOT NULL DEFAULT '{}',
  fallas       JSONB NOT NULL DEFAULT '{}',
  danos        JSONB NOT NULL DEFAULT '{}',
  veredicto    TEXT NOT NULL DEFAULT 'pendiente' CHECK (veredicto IN ('pendiente', 'apta', 'observaciones', 'no_apta')),
  estado       TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'firmado', 'a_taller')),
  firmado_por  TEXT,
  firmado_en   TIMESTAMPTZ,
  UNIQUE (unidad, fecha)
);

CREATE TABLE IF NOT EXISTS fotos (
  id            SERIAL PRIMARY KEY,
  checklist_id  INTEGER NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
  zona          TEXT NOT NULL,
  mime          TEXT NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp')),
  datos         BYTEA NOT NULL,
  subido_por    TEXT NOT NULL,
  subido_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Eventos, sincronización, configuración y bitácora
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS eventos_geocerca (
  id                  SERIAL PRIMARY KEY,
  evento_id           TEXT UNIQUE,
  tipo                TEXT NOT NULL CHECK (tipo IN ('entrada', 'salida')),
  samsara_vehicle_id  TEXT,
  unidad              TEXT,
  geocerca_samsara_id TEXT,
  geocerca_nombre     TEXT,
  tiempo              TIMESTAMPTZ NOT NULL,
  payload             JSONB NOT NULL,
  recibido_en         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_eventos_tiempo ON eventos_geocerca (tiempo DESC);

CREATE TABLE IF NOT EXISTS sync_estado (
  clave           TEXT PRIMARY KEY,
  valor           TEXT,
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS configuracion (
  clave  TEXT PRIMARY KEY,
  valor  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auditoria (
  id         SERIAL PRIMARY KEY,
  usuario    TEXT NOT NULL,
  accion     TEXT NOT NULL,
  detalle    JSONB,
  ip         TEXT,
  creado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON auditoria (creado_en DESC);

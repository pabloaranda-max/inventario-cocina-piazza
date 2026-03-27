-- ================================================================
-- piazza-operaciones — Schema D1
-- ================================================================

-- ── Auth ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS usuarios (
  id          TEXT PRIMARY KEY,
  nombre      TEXT NOT NULL,
  area        TEXT NOT NULL,   -- COCINA | BARRA | SALUMERIA | CAVA | ALIMENTARI | ADMIN
  rol         TEXT NOT NULL DEFAULT 'operario',  -- operario | encargado | admin
  pin_hash    TEXT NOT NULL,
  activo      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invitaciones (
  token       TEXT PRIMARY KEY,
  area        TEXT NOT NULL,
  rol         TEXT NOT NULL DEFAULT 'operario',
  usado       INTEGER NOT NULL DEFAULT 0,
  created_by  TEXT NOT NULL,   -- usuario_id de quien generó
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL    -- datetime ISO
);

CREATE TABLE IF NOT EXISTS sesiones (
  token       TEXT PRIMARY KEY,
  usuario_id  TEXT NOT NULL REFERENCES usuarios(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL
);

-- ── Catálogo (sincronizado desde scraper vía sync_d1.py) ──────────

CREATE TABLE IF NOT EXISTS articulos (
  id_xetux              TEXT PRIMARY KEY,  -- código XMAT...
  nombre                TEXT NOT NULL,
  unidad                TEXT NOT NULL,
  almacen               TEXT NOT NULL,
  tipo_producto         TEXT,
  stock_actual          REAL NOT NULL DEFAULT 0,
  costo_unit            REAL NOT NULL DEFAULT 0,
  costo_total           REAL NOT NULL DEFAULT 0,
  dias_vencimiento      INTEGER,
  -- Clasificación de perecibilidad (configurable por admin)
  categoria_perecibilidad TEXT DEFAULT 'sin-clasificar',  -- alta-baja | baja-alta | alta-alta | sin-clasificar
  activo                INTEGER NOT NULL DEFAULT 1,
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS subrecetas (
  id_xetux    TEXT PRIMARY KEY,  -- código de subreceta en xetux
  nombre      TEXT NOT NULL,
  unidad      TEXT NOT NULL,
  rendimiento REAL NOT NULL DEFAULT 1,
  area        TEXT NOT NULL,     -- área a la que pertenece
  activo      INTEGER NOT NULL DEFAULT 1,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mise_en_place_catalogo (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  subreceta_id   TEXT NOT NULL REFERENCES subrecetas(id_xetux),
  ingrediente    TEXT NOT NULL,  -- nombre del ingrediente
  codigo_xetux   TEXT,           -- código XMAT si se puede mapear
  cantidad_por_unidad REAL NOT NULL,
  unidad         TEXT NOT NULL
);

-- ── Producciones ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS producciones (
  id             TEXT PRIMARY KEY,
  usuario_id     TEXT NOT NULL REFERENCES usuarios(id),
  subreceta_id   TEXT NOT NULL REFERENCES subrecetas(id_xetux),
  cantidad       REAL NOT NULL,
  fecha          TEXT NOT NULL,  -- YYYY-MM-DD
  area           TEXT NOT NULL,
  hora_inicio    TEXT,           -- HH:MM (opcional)
  hora_fin       TEXT,           -- HH:MM (opcional)
  estado         TEXT NOT NULL DEFAULT 'pendiente',
  -- pendiente | autorizado | rechazado | cargado | error_carga
  notas          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mise_en_place_real (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  produccion_id      TEXT NOT NULL REFERENCES producciones(id),
  ingrediente        TEXT NOT NULL,
  cantidad_esperada  REAL NOT NULL,
  cantidad_real      REAL NOT NULL,
  diferencia_pct     REAL NOT NULL,  -- (real - esperado) / esperado
  unidad             TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS votos (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  produccion_id  TEXT NOT NULL REFERENCES producciones(id),
  usuario_id     TEXT NOT NULL REFERENCES usuarios(id),
  voto           TEXT NOT NULL,  -- autoriza | rechaza
  anotacion      TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(produccion_id, usuario_id)
);

-- ── Mermas ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS motivos_merma (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre  TEXT NOT NULL UNIQUE,
  fuente  TEXT NOT NULL DEFAULT 'manual'  -- xetux | manual
);

INSERT OR IGNORE INTO motivos_merma (nombre, fuente) VALUES
  ('Caducado',              'xetux'),
  ('Error de producción',   'xetux'),
  ('Rotura',                'xetux'),
  ('Devolución',            'xetux'),
  ('Exceso de producción',  'manual'),
  ('Contaminación',         'manual'),
  ('Otro',                  'manual');

CREATE TABLE IF NOT EXISTS mermas (
  id             TEXT PRIMARY KEY,
  usuario_id     TEXT NOT NULL REFERENCES usuarios(id),
  articulo_id    TEXT NOT NULL REFERENCES articulos(id_xetux),
  almacen        TEXT NOT NULL,
  cantidad       REAL NOT NULL,
  unidad         TEXT NOT NULL,
  motivo_id      INTEGER REFERENCES motivos_merma(id),
  motivo_texto   TEXT,   -- si motivo es "Otro"
  notas          TEXT,
  fecha          TEXT NOT NULL,  -- YYYY-MM-DD
  area           TEXT NOT NULL,
  estado         TEXT NOT NULL DEFAULT 'pendiente',
  -- pendiente | cargado | error_carga
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Snapshots de datos del scraper ────────────────────────────────

CREATE TABLE IF NOT EXISTS inventario_snapshots (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha       TEXT NOT NULL,   -- YYYY-MM-DD
  almacen     TEXT NOT NULL,
  articulo_id TEXT NOT NULL,
  stock       REAL NOT NULL,
  costo_unit  REAL NOT NULL,
  UNIQUE(fecha, almacen, articulo_id)
);

CREATE TABLE IF NOT EXISTS compras_diarias (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha        TEXT NOT NULL,
  almacen      TEXT NOT NULL,
  articulo_id  TEXT NOT NULL,
  nombre       TEXT NOT NULL,
  cantidad     REAL NOT NULL,
  unidad       TEXT NOT NULL,
  subtotal     REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS ventas_diarias (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha           TEXT NOT NULL,
  tipo_producto   TEXT NOT NULL,
  producto        TEXT NOT NULL,
  ambiente        TEXT NOT NULL,
  cantidad        REAL NOT NULL,
  venta_neta      REAL NOT NULL,
  costo_teorico   REAL NOT NULL
);

-- ── Índices ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS transferencias_diarias (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha           TEXT NOT NULL,
  almacen_origen  TEXT NOT NULL,
  almacen_destino TEXT NOT NULL,
  nombre          TEXT NOT NULL,
  cantidad        REAL NOT NULL,
  unidad          TEXT NOT NULL,
  costo_unit      REAL NOT NULL DEFAULT 0,
  costo_total     REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS inventario_cerrado_mensual (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  mes         TEXT NOT NULL,   -- YYYY-MM
  almacen     TEXT NOT NULL,
  articulo_id TEXT NOT NULL,
  nombre      TEXT NOT NULL,
  unidad      TEXT NOT NULL,
  cantidad    REAL NOT NULL,   -- Cantidad Total (contada + receta)
  costo_unit  REAL NOT NULL DEFAULT 0,  -- Costo Promedio
  costo_total REAL NOT NULL DEFAULT 0,  -- Total Costo Promedio
  UNIQUE(mes, almacen, articulo_id)
);

-- ── Índices ───────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_producciones_area       ON producciones(area, fecha);
CREATE INDEX IF NOT EXISTS idx_producciones_estado     ON producciones(estado);
CREATE INDEX IF NOT EXISTS idx_mermas_area             ON mermas(area, fecha);
CREATE INDEX IF NOT EXISTS idx_mermas_estado           ON mermas(estado);
CREATE INDEX IF NOT EXISTS idx_sesiones_usuario        ON sesiones(usuario_id);
CREATE INDEX IF NOT EXISTS idx_inv_snapshots_fecha     ON inventario_snapshots(fecha, almacen);
CREATE INDEX IF NOT EXISTS idx_compras_fecha           ON compras_diarias(fecha, almacen);
CREATE INDEX IF NOT EXISTS idx_ventas_fecha            ON ventas_diarias(fecha, tipo_producto);
CREATE INDEX IF NOT EXISTS idx_transferencias_fecha    ON transferencias_diarias(fecha, almacen_origen);
CREATE INDEX IF NOT EXISTS idx_inv_cerrado_mes         ON inventario_cerrado_mensual(mes, almacen);

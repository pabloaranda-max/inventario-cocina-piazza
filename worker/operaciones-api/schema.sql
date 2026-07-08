-- ── Usuarios de la app (no son cuentas de xetux) ──────────────────────────
CREATE TABLE IF NOT EXISTS usuarios (
  id      TEXT PRIMARY KEY,
  nombre  TEXT NOT NULL,
  area    TEXT NOT NULL,        -- COCINA | BARRA | SALUMERIA | ADMIN | ALMACEN
  rol     TEXT DEFAULT 'captura', -- captura | revisor | admin
  password_hash TEXT NOT NULL
);

-- ── Sesiones ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sesiones (
  token     TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL,
  expiry    INTEGER NOT NULL
);

-- ── Producciones ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS producciones (
  id                 TEXT PRIMARY KEY,
  fecha              TEXT NOT NULL,        -- fecha real de producción
  subreceta_codigo   TEXT NOT NULL,
  subreceta_nombre   TEXT NOT NULL,
  cantidad_producida REAL NOT NULL,
  rendimiento        REAL DEFAULT NULL,    -- rendimiento de la subreceta en xetux
  unidad             TEXT DEFAULT '',
  encargado_id       TEXT NOT NULL,        -- usuario.id de quien capturó
  area               TEXT NOT NULL,
  estado             TEXT DEFAULT 'pendiente', -- pendiente | aprobado | en_revision | cargado | rechazado
  notas              TEXT DEFAULT '',
  created_at         INTEGER NOT NULL      -- timestamp unix
);

-- ── Mise en place por producción ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mise_en_place (
  id                  TEXT PRIMARY KEY,
  produccion_id       TEXT NOT NULL,
  ingrediente_codigo  TEXT NOT NULL,
  ingrediente_nombre  TEXT NOT NULL,
  cantidad_esperada   REAL NOT NULL,
  cantidad_real       REAL NOT NULL,
  unidad              TEXT DEFAULT '',
  FOREIGN KEY (produccion_id) REFERENCES producciones(id)
);

-- ── Mermas ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mermas (
  id               TEXT PRIMARY KEY,
  fecha            TEXT NOT NULL,
  articulo_codigo  TEXT NOT NULL,
  articulo_nombre  TEXT NOT NULL,
  almacen          TEXT NOT NULL,
  cantidad         REAL NOT NULL,
  unidad           TEXT DEFAULT '',
  encargado_id     TEXT NOT NULL,
  area             TEXT NOT NULL,
  estado           TEXT DEFAULT 'pendiente',
  comentario       TEXT DEFAULT '',
  created_at       INTEGER NOT NULL
);

-- ── Aprobaciones ──────────────────────────────────────────────────────────
-- Una fila por revisor por registro. decision: aprobado | en_revision | rechazado
CREATE TABLE IF NOT EXISTS aprobaciones (
  id            TEXT PRIMARY KEY,
  registro_tipo TEXT NOT NULL,   -- produccion | merma
  registro_id   TEXT NOT NULL,
  revisor_id    TEXT NOT NULL,
  decision      TEXT NOT NULL,   -- aprobado | en_revision | rechazado
  comentario    TEXT DEFAULT '',
  created_at    INTEGER NOT NULL
);

-- ── Catálogo de artículos (sincronizado desde xetux) ─────────────────────
CREATE TABLE IF NOT EXISTS catalogo_articulos (
  codigo     TEXT NOT NULL,
  nombre     TEXT NOT NULL,
  grupo      TEXT DEFAULT '',
  subgrupo   TEXT DEFAULT '',
  unidad     TEXT DEFAULT '',
  almacen    TEXT NOT NULL,      -- COCINA | BARRA | SALUMERIA | CAVA
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (codigo, almacen)
);

-- ── Catálogo de subrecetas ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS catalogo_subrecetas (
  codigo      TEXT PRIMARY KEY,
  nombre      TEXT NOT NULL,
  rendimiento REAL DEFAULT NULL,
  unidad      TEXT DEFAULT '',
  updated_at  INTEGER NOT NULL
);

-- ── Ingredientes por subreceta ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS catalogo_ingredientes (
  id                 TEXT PRIMARY KEY,
  subreceta_codigo   TEXT NOT NULL,
  ingrediente_codigo TEXT NOT NULL,
  ingrediente_nombre TEXT NOT NULL,
  cantidad           REAL NOT NULL,
  unidad             TEXT DEFAULT '',
  FOREIGN KEY (subreceta_codigo) REFERENCES catalogo_subrecetas(codigo)
);

-- ── Inventario: plantillas Xetux (una por almacén) ───────────────────────
CREATE TABLE IF NOT EXISTS inv_plantillas (
  almacen          TEXT PRIMARY KEY,
  row_map          TEXT NOT NULL DEFAULT '{}',   -- JSON: {cod: rowIndex}
  cantidad_col_idx INTEGER NOT NULL DEFAULT 7,
  pres_map         TEXT NOT NULL DEFAULT '{}',   -- JSON: {cod: [{nombre, factor}]}
  unit_map         TEXT NOT NULL DEFAULT '{}',   -- JSON: {cod: unidad} — fuente de verdad, override del catálogo
  default_pres     TEXT NOT NULL DEFAULT '{}',   -- JSON: {unidad: [{nombre, factor}]} — para artículos sin pres en Xetux
  raw              TEXT NOT NULL DEFAULT '',      -- XLSX original en base64
  original_filename TEXT NOT NULL DEFAULT '',     -- nombre del archivo exportado por Xetux (migración 0003)
  template_hash    TEXT NOT NULL DEFAULT '',
  updated_at       TEXT NOT NULL DEFAULT ''
);

-- ── Inventario: sesiones de conteo ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inv_sesiones (
  almacen              TEXT NOT NULL,
  fecha                TEXT NOT NULL,
  operario             TEXT NOT NULL,
  counts               TEXT NOT NULL DEFAULT '{}', -- legacy JSON: {cod: cantidad}
  counts_by_zone       TEXT NOT NULL DEFAULT '{}', -- JSON: {zoneIdx: {cod: cantidad}}
  pres_choice_by_zone  TEXT NOT NULL DEFAULT '{}', -- JSON: {zoneIdx: {cod: factor}}
  corrections_by_zone  TEXT NOT NULL DEFAULT '{}', -- JSON: {zoneIdx: {cod: metadata}}
  completed_zones      TEXT NOT NULL DEFAULT '[]', -- JSON: [zoneIdx, ...]
  locked_zones         TEXT NOT NULL DEFAULT '{}', -- JSON: {zoneIdx: {device_id, operario, ts}}
  manuales             TEXT NOT NULL DEFAULT '[]',
  template_hash        TEXT NOT NULL DEFAULT '',
  exported_at          TEXT NOT NULL DEFAULT '',
  exported_by          TEXT NOT NULL DEFAULT '',
  zone_config_id       TEXT NOT NULL DEFAULT '',   -- migración 0005 (R5)
  zone_snapshot        TEXT NOT NULL DEFAULT '',   -- migración 0005 (R5): zonas congeladas al iniciar la toma
  operarios_by_device  TEXT NOT NULL DEFAULT '',   -- migración 0006 (R5.1): JSON {deviceId: {operario, at}}
  updated_at           TEXT NOT NULL,
  PRIMARY KEY (almacen, fecha)
);

-- ── Inventario: preparación editable de conteo (migración 0004, R5) ───────
CREATE TABLE IF NOT EXISTS inv_zone_configs (
  id            TEXT PRIMARY KEY,
  almacen       TEXT NOT NULL,
  template_hash TEXT NOT NULL DEFAULT '',
  zones_json    TEXT NOT NULL DEFAULT '[]',
  active        INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_zone_configs_almacen ON inv_zone_configs (almacen, active);

-- ── Inventario: admins restringidos por almacén (migración 0007, R7) ──────
-- Solo el password maestro (INV_ADMIN_PASSWORD) crea/edita perfiles.
CREATE TABLE IF NOT EXISTS inv_admins (
  id            TEXT PRIMARY KEY,
  nombre        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  almacenes     TEXT NOT NULL DEFAULT '[]',       -- JSON: ["COCINA", "CAVA", ...]
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT,
  updated_at    TEXT
);

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
  cantidad_col_idx INTEGER NOT NULL DEFAULT 6,
  pres_map         TEXT NOT NULL DEFAULT '{}',   -- JSON: {cod: [{nombre, factor}]}
  raw              TEXT NOT NULL DEFAULT '',      -- XLSX original en base64
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
  completed_zones      TEXT NOT NULL DEFAULT '[]', -- JSON: [zoneIdx, ...]
  locked_zones         TEXT NOT NULL DEFAULT '{}', -- JSON: {zoneIdx: {device_id, operario, ts}}
  manuales             TEXT NOT NULL DEFAULT '[]',
  template_hash        TEXT NOT NULL DEFAULT '',
  updated_at           TEXT NOT NULL,
  PRIMARY KEY (almacen, fecha)
);

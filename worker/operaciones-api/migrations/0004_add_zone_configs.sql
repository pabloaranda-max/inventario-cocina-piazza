-- 0004: preparación editable de conteo (Slice R5, spec v4.7 §14)
-- Una config por almacén define zonas, artículos activos/inactivos y orden.
-- Las sesiones congelan su zoneSnapshot al iniciar: editar una config nunca
-- altera una toma abierta o exportada.
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

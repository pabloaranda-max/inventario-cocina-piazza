-- Agrega estado de exportación a inv_sesiones.
-- Aplicar con:
--   wrangler d1 execute operaciones-db --file=migrations/0001_add_export_state.sql
ALTER TABLE inv_sesiones ADD COLUMN exported_at TEXT NOT NULL DEFAULT '';
ALTER TABLE inv_sesiones ADD COLUMN exported_by TEXT NOT NULL DEFAULT '';

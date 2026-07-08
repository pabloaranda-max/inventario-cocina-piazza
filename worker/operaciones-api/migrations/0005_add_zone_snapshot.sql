-- 0005: snapshot de preparación por sesión (Slice R5, spec v4.7 §14)
-- La sesión congela las zonas con las que inició (zone_snapshot, first-write-wins
-- en el Worker): editar o activar otra preparación nunca altera una toma abierta,
-- y un segundo dispositivo que continúa la toma ve las mismas zonas.
ALTER TABLE inv_sesiones ADD COLUMN zone_config_id TEXT NOT NULL DEFAULT '';
ALTER TABLE inv_sesiones ADD COLUMN zone_snapshot TEXT NOT NULL DEFAULT '';

-- R23: acuses inmutables emitidos al cerrar una zona.
-- Cada cierre confirmado conserva exactamente lo recibido por dispositivo,
-- incluso si la zona se reabre y luego se corrige.
CREATE TABLE IF NOT EXISTS inv_receipts (
  id            TEXT PRIMARY KEY,
  almacen       TEXT NOT NULL,
  fecha         TEXT NOT NULL,
  device_id     TEXT NOT NULL,
  operario      TEXT NOT NULL,
  zone_key      TEXT NOT NULL,
  zone_name     TEXT NOT NULL DEFAULT '',
  payload_json  TEXT NOT NULL,
  payload_hash  TEXT NOT NULL,
  received_at   TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_receipts_hash
  ON inv_receipts (payload_hash);

CREATE INDEX IF NOT EXISTS idx_inv_receipts_session_device
  ON inv_receipts (almacen, fecha, device_id, received_at);

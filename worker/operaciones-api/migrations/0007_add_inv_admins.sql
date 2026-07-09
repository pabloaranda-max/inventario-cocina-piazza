-- R7: admins restringidos por almacén.
-- Solo el password maestro (INV_ADMIN_PASSWORD) crea/edita perfiles; cada perfil
-- lleva la lista de almacenes que puede administrar (JSON array de claves
-- canónicas: COCINA, CAVA, BARRA_RESTAURANTE, ...).
CREATE TABLE IF NOT EXISTS inv_admins (
  id            TEXT PRIMARY KEY,
  nombre        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  almacenes     TEXT NOT NULL DEFAULT '[]',
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT,
  updated_at    TEXT
);

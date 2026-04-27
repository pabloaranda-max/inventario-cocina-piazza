ALTER TABLE mantenimientos
  ADD COLUMN IF NOT EXISTS estado_ejecucion text NOT NULL DEFAULT 'aplicado'
    CHECK (estado_ejecucion IN ('planeado', 'aplicado')),
  ADD COLUMN IF NOT EXISTS costo_estimado numeric(10,2);

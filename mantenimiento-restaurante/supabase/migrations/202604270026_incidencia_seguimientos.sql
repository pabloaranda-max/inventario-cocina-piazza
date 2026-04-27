-- Seguimientos de incidencias en estado en_progreso
-- Cada fila es una actualización de avance con fecha automática

CREATE TABLE incidencia_seguimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incidencia_id uuid NOT NULL REFERENCES incidencias(id) ON DELETE CASCADE,
  texto text NOT NULL,
  registrado_por text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_seguimientos_incidencia_id ON incidencia_seguimientos(incidencia_id);

ALTER TABLE incidencia_seguimientos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados gestionan seguimientos"
  ON incidencia_seguimientos
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

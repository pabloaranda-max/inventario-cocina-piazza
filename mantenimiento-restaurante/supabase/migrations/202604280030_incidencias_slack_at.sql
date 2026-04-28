alter table incidencias
  add column if not exists reportado_slack_at timestamptz;

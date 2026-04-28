-- Permite fusionar incidencias duplicadas: la secundaria apunta a la principal
alter table incidencias
  add column if not exists fusionada_en_id uuid references incidencias(id) on delete set null;

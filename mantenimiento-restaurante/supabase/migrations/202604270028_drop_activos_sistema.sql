alter table activos
  drop column if exists sistema;

drop index if exists idx_activos_sistema;

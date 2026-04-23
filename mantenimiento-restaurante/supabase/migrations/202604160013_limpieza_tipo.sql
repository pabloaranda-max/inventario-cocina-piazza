alter table activos
  add column if not exists limpieza_tipo text check (limpieza_tipo in ('interno', 'contratado')),
  add column if not exists limpieza_proveedor_id uuid references proveedores(id) on delete set null;

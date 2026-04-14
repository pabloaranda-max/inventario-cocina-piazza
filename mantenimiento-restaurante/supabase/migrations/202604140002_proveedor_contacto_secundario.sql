alter table proveedores
  add column if not exists contacto_secundario text,
  add column if not exists telefono_secundario text;

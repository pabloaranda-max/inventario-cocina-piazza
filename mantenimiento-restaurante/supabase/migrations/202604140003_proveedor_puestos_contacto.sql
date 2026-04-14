alter table proveedores
  add column if not exists puesto_contacto text,
  add column if not exists puesto_contacto_secundario text;

create table if not exists mapa_zonas (
  id uuid primary key default gen_random_uuid(),
  area text not null,
  label text not null,
  x numeric(6, 3) not null,
  y numeric(6, 3) not null,
  visible boolean not null default true,
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists set_mapa_zonas_updated_at on mapa_zonas;
create trigger set_mapa_zonas_updated_at
before update on mapa_zonas
for each row execute function set_updated_at();
alter table mapa_zonas enable row level security;
drop policy if exists "Usuarios autenticados gestionan mapa_zonas" on mapa_zonas;
create policy "Usuarios autenticados gestionan mapa_zonas"
on mapa_zonas for all
to authenticated
using (true)
with check (true);
insert into mapa_zonas (area, label, x, y, orden)
values
  ('Hostess', 'Hostess', 9, 13, 10),
  ('Porche', 'Porche', 8, 28, 20),
  ('Barra', 'Barra', 84, 45, 30),
  ('Salón', 'Salón', 55, 36, 40),
  ('Bodega', 'Bodega', 82, 11, 50),
  ('Cocina caliente', 'Cocina', 49, 78, 60),
  ('Cocina fría', 'Cocina fría', 39, 69, 70),
  ('Lavado', 'Lavado', 67, 73, 80),
  ('Almacén', 'Almacén', 78, 74, 90),
  ('Counter venta', 'Counter', 21, 52, 100)
on conflict do nothing;

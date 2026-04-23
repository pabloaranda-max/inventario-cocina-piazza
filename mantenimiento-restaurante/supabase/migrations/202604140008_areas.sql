create table if not exists areas (
  nombre text primary key,
  created_at timestamptz not null default now()
);
-- Poblar con las áreas existentes de equipos y zonas del mapa.
insert into areas (nombre)
select distinct area from equipos where area is not null
on conflict do nothing;
insert into areas (nombre) values
  ('Cocina caliente'),
  ('Cocina fría'),
  ('Barra'),
  ('Salón'),
  ('Almacén'),
  ('Lavado'),
  ('Cuarto frío'),
  ('Azotea / exterior'),
  ('Oficina'),
  ('Baños')
on conflict do nothing;
insert into areas (nombre)
select distinct area from mapa_zonas where area is not null and area != ''
on conflict do nothing;
alter table areas enable row level security;
drop policy if exists "Usuarios autenticados gestionan areas" on areas;
create policy "Usuarios autenticados gestionan areas"
on areas for all
to authenticated
using (true)
with check (true);

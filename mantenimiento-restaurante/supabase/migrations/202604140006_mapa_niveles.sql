create table if not exists mapa_niveles (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  imagen_url text not null,
  orden integer not null default 0,
  visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists set_mapa_niveles_updated_at on mapa_niveles;
create trigger set_mapa_niveles_updated_at
before update on mapa_niveles
for each row execute function set_updated_at();
alter table mapa_niveles enable row level security;
drop policy if exists "Usuarios autenticados gestionan mapa_niveles" on mapa_niveles;
create policy "Usuarios autenticados gestionan mapa_niveles"
on mapa_niveles for all
to authenticated
using (true)
with check (true);
insert into mapa_niveles (id, nombre, imagen_url, orden)
values
  ('00000000-0000-4000-8000-000000000001', 'Portada', '/mapa/page-01.png', 10),
  ('00000000-0000-4000-8000-000000000002', 'Planta baja', '/mapa/page-02.png', 20),
  ('00000000-0000-4000-8000-000000000003', 'Primer nivel', '/mapa/page-03.png', 30),
  ('00000000-0000-4000-8000-000000000004', 'Lámina 04', '/mapa/page-04.png', 40),
  ('00000000-0000-4000-8000-000000000005', 'Lámina 05', '/mapa/page-05.png', 50),
  ('00000000-0000-4000-8000-000000000006', 'Lámina 06', '/mapa/page-06.png', 60),
  ('00000000-0000-4000-8000-000000000007', 'Lámina 07', '/mapa/page-07.png', 70),
  ('00000000-0000-4000-8000-000000000008', 'Lámina 08', '/mapa/page-08.png', 80),
  ('00000000-0000-4000-8000-000000000009', 'Lámina 09', '/mapa/page-09.png', 90),
  ('00000000-0000-4000-8000-000000000010', 'Lámina 10', '/mapa/page-10.png', 100),
  ('00000000-0000-4000-8000-000000000011', 'Acabados planta baja', '/mapa/page-11.png', 110),
  ('00000000-0000-4000-8000-000000000012', 'Acabados primer nivel', '/mapa/page-12.png', 120),
  ('00000000-0000-4000-8000-000000000013', 'Lámina 13', '/mapa/page-13.png', 130)
on conflict (id) do update
set nombre = excluded.nombre,
    imagen_url = excluded.imagen_url,
    orden = excluded.orden,
    visible = true;
alter table mapa_zonas
  add column if not exists nivel_id uuid references mapa_niveles(id) on delete cascade;
update mapa_zonas
set nivel_id = '00000000-0000-4000-8000-000000000002'
where nivel_id is null;
alter table mapa_zonas
  alter column nivel_id set not null;
create index if not exists idx_mapa_zonas_nivel_id on mapa_zonas(nivel_id);

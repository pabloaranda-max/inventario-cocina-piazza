-- Esquema inicial para la app interna de mantenimiento.
-- Ejecutar en Supabase SQL Editor.

create extension if not exists pgcrypto;

create sequence if not exists incidencia_ticket_seq;

-- ENUMS
do $$
begin
  create type estado_equipo as enum ('operativo', 'en_reparacion', 'fuera_de_servicio', 'pendiente_revision');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type prioridad_incidencia as enum ('baja', 'media', 'alta', 'urgente');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type estado_incidencia as enum ('abierta', 'en_progreso', 'resuelta', 'cerrada');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type tipo_mantenimiento as enum ('preventivo', 'correctivo');
exception
  when duplicate_object then null;
end $$;

-- TABLAS
create table if not exists proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  especialidad text,
  telefono text,
  contacto text,
  puesto_contacto text,
  telefono_secundario text,
  contacto_secundario text,
  puesto_contacto_secundario text,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists equipos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  area text,
  categoria text,
  marca text,
  modelo text,
  numero_serie text,
  foto_url text,
  foto_placa_url text,
  estado estado_equipo not null default 'operativo',
  proveedor_id uuid references proveedores(id) on delete set null,
  fecha_ultimo_mantenimiento date,
  fecha_proximo_mantenimiento date,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists incidencias (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid references equipos(id) on delete set null,
  ticket_numero text not null default 'INC-' || lpad(nextval('incidencia_ticket_seq')::text, 6, '0'),
  descripcion text not null,
  prioridad prioridad_incidencia not null default 'media',
  foto_url text,
  reportado_por text,
  fecha_reporte date not null default current_date,
  estado estado_incidencia not null default 'abierta',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists mantenimientos (
  id uuid primary key default gen_random_uuid(),
  tipo tipo_mantenimiento not null,
  equipo_id uuid not null references equipos(id) on delete cascade,
  incidencia_id uuid references incidencias(id) on delete set null,
  descripcion text not null,
  realizado_por text,
  costo numeric(10, 2),
  repuestos_notas text,
  fotos_urls text[] not null default '{}',
  fecha_realizacion date not null default current_date,
  proxima_fecha_sugerida date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create index if not exists idx_equipos_proveedor_id on equipos(proveedor_id);
create index if not exists idx_equipos_proximo_mantenimiento on equipos(fecha_proximo_mantenimiento);
create index if not exists idx_incidencias_estado on incidencias(estado);
create index if not exists idx_incidencias_equipo_id on incidencias(equipo_id);
create unique index if not exists idx_incidencias_ticket_numero on incidencias(ticket_numero);
create index if not exists idx_mantenimientos_equipo_id on mantenimientos(equipo_id);
create index if not exists idx_mantenimientos_incidencia_id on mantenimientos(incidencia_id);
create index if not exists idx_mantenimientos_fecha on mantenimientos(fecha_realizacion desc);

-- UPDATED_AT
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_proveedores_updated_at on proveedores;
create trigger set_proveedores_updated_at
before update on proveedores
for each row execute function set_updated_at();

drop trigger if exists set_equipos_updated_at on equipos;
create trigger set_equipos_updated_at
before update on equipos
for each row execute function set_updated_at();

drop trigger if exists set_incidencias_updated_at on incidencias;
create trigger set_incidencias_updated_at
before update on incidencias
for each row execute function set_updated_at();

drop trigger if exists set_mantenimientos_updated_at on mantenimientos;
create trigger set_mantenimientos_updated_at
before update on mantenimientos
for each row execute function set_updated_at();

drop trigger if exists set_mapa_zonas_updated_at on mapa_zonas;
create trigger set_mapa_zonas_updated_at
before update on mapa_zonas
for each row execute function set_updated_at();

-- RPC transaccional para registrar mantenimiento y actualizar equipo.
create or replace function registrar_mantenimiento(
  p_tipo tipo_mantenimiento,
  p_equipo_id uuid,
  p_descripcion text,
  p_realizado_por text default null,
  p_costo numeric default null,
  p_repuestos_notas text default null,
  p_fotos_urls text[] default '{}',
  p_fecha_realizacion date default current_date,
  p_proxima_fecha_sugerida date default null,
  p_marcar_operativo boolean default false,
  p_incidencia_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_mantenimiento_id uuid;
begin
  if p_incidencia_id is not null then
    update incidencias
    set estado = 'en_progreso'
    where id = p_incidencia_id
      and (equipo_id = p_equipo_id or equipo_id is null);

    if not found then
      raise exception 'La incidencia no existe o no corresponde al equipo seleccionado';
    end if;
  end if;

  insert into mantenimientos (
    tipo,
    equipo_id,
    incidencia_id,
    descripcion,
    realizado_por,
    costo,
    repuestos_notas,
    fotos_urls,
    fecha_realizacion,
    proxima_fecha_sugerida
  )
  values (
    p_tipo,
    p_equipo_id,
    p_incidencia_id,
    p_descripcion,
    p_realizado_por,
    p_costo,
    p_repuestos_notas,
    coalesce(p_fotos_urls, '{}'),
    p_fecha_realizacion,
    p_proxima_fecha_sugerida
  )
  returning id into v_mantenimiento_id;

  update equipos
  set
    fecha_ultimo_mantenimiento = p_fecha_realizacion,
    fecha_proximo_mantenimiento = coalesce(
      p_proxima_fecha_sugerida,
      fecha_proximo_mantenimiento
    ),
    estado = case
      when p_marcar_operativo then 'operativo'::estado_equipo
      else estado
    end
  where id = p_equipo_id;

  if not found then
    raise exception 'Equipo no encontrado';
  end if;

  return v_mantenimiento_id;
end;
$$;

grant execute on function registrar_mantenimiento(
  tipo_mantenimiento,
  uuid,
  text,
  text,
  numeric,
  text,
  text[],
  date,
  date,
  boolean,
  uuid
) to authenticated;

-- RLS
alter table proveedores enable row level security;
alter table equipos enable row level security;
alter table incidencias enable row level security;
alter table mantenimientos enable row level security;
alter table mapa_zonas enable row level security;

drop policy if exists "Usuarios autenticados gestionan proveedores" on proveedores;
create policy "Usuarios autenticados gestionan proveedores"
on proveedores for all
to authenticated
using (true)
with check (true);

drop policy if exists "Usuarios autenticados gestionan equipos" on equipos;
create policy "Usuarios autenticados gestionan equipos"
on equipos for all
to authenticated
using (true)
with check (true);

drop policy if exists "Usuarios autenticados gestionan incidencias" on incidencias;
create policy "Usuarios autenticados gestionan incidencias"
on incidencias for all
to authenticated
using (true)
with check (true);

drop policy if exists "Usuarios autenticados gestionan mantenimientos" on mantenimientos;
create policy "Usuarios autenticados gestionan mantenimientos"
on mantenimientos for all
to authenticated
using (true)
with check (true);

drop policy if exists "Usuarios autenticados gestionan mapa_zonas" on mapa_zonas;
create policy "Usuarios autenticados gestionan mapa_zonas"
on mapa_zonas for all
to authenticated
using (true)
with check (true);

-- STORAGE
-- Crear un bucket privado llamado "mantenimiento" en Supabase Storage.
-- Convencion de rutas:
--   equipos/{timestamp}-{archivo}
--   equipos/placas/{timestamp}-{archivo}
--   incidencias/{timestamp}-{archivo}
--   mantenimientos/{timestamp}-{archivo}
--
-- Politicas sugeridas para storage.objects:

drop policy if exists "Usuarios autenticados leen archivos de mantenimiento" on storage.objects;
create policy "Usuarios autenticados leen archivos de mantenimiento"
on storage.objects for select
to authenticated
using (bucket_id = 'mantenimiento');

drop policy if exists "Usuarios autenticados suben archivos de mantenimiento" on storage.objects;
create policy "Usuarios autenticados suben archivos de mantenimiento"
on storage.objects for insert
to authenticated
with check (bucket_id = 'mantenimiento');

drop policy if exists "Usuarios autenticados actualizan archivos de mantenimiento" on storage.objects;
create policy "Usuarios autenticados actualizan archivos de mantenimiento"
on storage.objects for update
to authenticated
using (bucket_id = 'mantenimiento')
with check (bucket_id = 'mantenimiento');

drop policy if exists "Usuarios autenticados eliminan archivos de mantenimiento" on storage.objects;
create policy "Usuarios autenticados eliminan archivos de mantenimiento"
on storage.objects for delete
to authenticated
using (bucket_id = 'mantenimiento');

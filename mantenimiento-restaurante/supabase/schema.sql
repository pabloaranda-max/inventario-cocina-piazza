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
  create type estado_incidencia as enum ('pendiente_asignacion', 'abierta', 'en_progreso', 'resuelta', 'cerrada');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type tipo_mantenimiento as enum ('preventivo', 'correctivo', 'limpieza_profunda');
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

create table if not exists infraestructura (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo text not null,
  area text,
  nivel_id uuid,
  x numeric(6, 3),
  y numeric(6, 3),
  estado text not null default 'operativo' check (
    estado in ('operativo', 'requiere_revision', 'obstruido', 'con_fuga', 'sin_acceso', 'fuera_de_servicio')
  ),
  criticidad text not null default 'media' check (criticidad in ('baja', 'media', 'alta', 'critica')),
  descripcion_ubicacion text,
  foto_url text,
  notas text,
  proveedor_id uuid references proveedores(id) on delete set null,
  fecha_ultima_revision date,
  fecha_proxima_revision date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint infraestructura_mapa_coords_check check (
    (nivel_id is null and x is null and y is null)
    or (nivel_id is not null and x is not null and y is not null and x >= 0 and x <= 100 and y >= 0 and y <= 100)
  )
);

create table if not exists activos (
  id uuid primary key default gen_random_uuid(),
  clase text not null check (clase in ('equipo', 'infraestructura', 'mobiliario', 'edificacion', 'sistema')),
  nombre text not null,
  tipo text not null,
  area text,
  zona_id uuid,
  estado text not null default 'operativo' check (
    estado in (
      'operativo',
      'pendiente_revision',
      'en_reparacion',
      'requiere_revision',
      'obstruido',
      'con_fuga',
      'sin_acceso',
      'fuera_de_servicio'
    )
  ),
  criticidad text not null default 'media' check (criticidad in ('baja', 'media', 'alta', 'critica')),
  proveedor_id uuid references proveedores(id) on delete set null,
  nivel_id uuid,
  x numeric(6, 3),
  y numeric(6, 3),
  foto_url text,
  notas text,
  fecha_ultima_revision date,
  fecha_proxima_revision date,
  limpieza_intervalo_dias integer,
  limpieza_tipo text check (limpieza_tipo in ('interno', 'contratado')),
  limpieza_proveedor_id uuid references proveedores(id) on delete set null,
  fecha_ultima_limpieza date,
  fecha_proxima_limpieza date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activos_mapa_coords_check check (
    (nivel_id is null and x is null and y is null)
    or (nivel_id is not null and x is not null and y is not null and x >= 0 and x <= 100 and y >= 0 and y <= 100)
  )
);

create table if not exists equipos_detalle (
  activo_id uuid primary key references activos(id) on delete cascade,
  categoria text,
  marca text,
  modelo text,
  numero_serie text,
  foto_placa_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists infraestructura_detalle (
  activo_id uuid primary key references activos(id) on delete cascade,
  descripcion_ubicacion text,
  acceso text,
  plano_referencia text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists incidencias (
  id uuid primary key default gen_random_uuid(),
  activo_id uuid references activos(id) on delete set null,
  equipo_id uuid references equipos(id) on delete set null,
  infraestructura_id uuid references infraestructura(id) on delete set null,
  zona_id uuid,
  zona_nombre text,
  ticket_numero text not null default 'INC-' || lpad(nextval('incidencia_ticket_seq')::text, 6, '0'),
  descripcion text not null,
  prioridad prioridad_incidencia not null default 'media',
  foto_url text,
  reportado_por text,
  fecha_reporte timestamptz not null default now(),
  asignado_a text,
  fecha_resuelta timestamptz,
  validado_por text,
  estado estado_incidencia not null default 'abierta',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists mantenimientos (
  id uuid primary key default gen_random_uuid(),
  tipo tipo_mantenimiento not null,
  activo_id uuid references activos(id) on delete set null,
  equipo_id uuid references equipos(id) on delete cascade,
  infraestructura_id uuid references infraestructura(id) on delete set null,
  incidencia_id uuid references incidencias(id) on delete set null,
  zona_id uuid,
  zona_nombre text,
  descripcion text not null,
  realizado_por text,
  ejecucion_tipo text not null default 'interno' check (ejecucion_tipo in ('interno', 'externo')),
  requiere_material boolean not null default false,
  proveedor_id uuid references proveedores(id) on delete set null,
  costo numeric(10, 2),
  repuestos_notas text,
  fotos_urls text[] not null default '{}',
  fecha_realizacion date not null default current_date,
  proxima_fecha_sugerida date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table incidencias
  drop constraint if exists incidencias_un_destino_check;

alter table incidencias
  add constraint incidencias_un_destino_check
  check (num_nonnulls(equipo_id, infraestructura_id) <= 1);

alter table mantenimientos
  drop constraint if exists mantenimientos_un_destino_check;

alter table mantenimientos
  add constraint mantenimientos_un_destino_check
  check (
    (
      tipo = 'limpieza_profunda'
      and num_nonnulls(equipo_id, infraestructura_id) <= 1
    )
    or (
      tipo <> 'limpieza_profunda'
      and (
        num_nonnulls(equipo_id, infraestructura_id) = 1
        or (activo_id is not null and equipo_id is null and infraestructura_id is null)
      )
    )
  );

create table if not exists areas (
  nombre text primary key,
  created_at timestamptz not null default now()
);

create table if not exists mapa_niveles (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  imagen_url text not null,
  orden integer not null default 0,
  visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table infraestructura
  drop constraint if exists infraestructura_nivel_id_fkey;

alter table infraestructura
  add constraint infraestructura_nivel_id_fkey
  foreign key (nivel_id) references mapa_niveles(id) on delete set null;

alter table activos
  drop constraint if exists activos_nivel_id_fkey;

alter table activos
  add constraint activos_nivel_id_fkey
  foreign key (nivel_id) references mapa_niveles(id) on delete set null;

create table if not exists mapa_zonas (
  id uuid primary key default gen_random_uuid(),
  nivel_id uuid not null references mapa_niveles(id) on delete cascade,
  parent_id uuid references mapa_zonas(id) on delete set null,
  area text not null,
  label text not null,
  nombre text not null,
  tipo text not null default 'zona' check (tipo in ('zona', 'subzona')),
  geometry_tipo text not null default 'point' check (geometry_tipo in ('point', 'rect', 'polygon')),
  geometry jsonb,
  color text,
  descripcion text,
  x numeric(6, 3) not null,
  y numeric(6, 3) not null,
  visible boolean not null default true,
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table activos
  drop constraint if exists activos_zona_id_fkey;

alter table activos
  add constraint activos_zona_id_fkey
  foreign key (zona_id) references mapa_zonas(id) on delete set null;

alter table incidencias
  drop constraint if exists incidencias_zona_id_fkey;

alter table incidencias
  add constraint incidencias_zona_id_fkey
  foreign key (zona_id) references mapa_zonas(id) on delete set null;

alter table mantenimientos
  drop constraint if exists mantenimientos_zona_id_fkey;

alter table mantenimientos
  add constraint mantenimientos_zona_id_fkey
  foreign key (zona_id) references mapa_zonas(id) on delete set null;

create index if not exists idx_equipos_proveedor_id on equipos(proveedor_id);
create index if not exists idx_equipos_proximo_mantenimiento on equipos(fecha_proximo_mantenimiento);
create index if not exists idx_activos_clase on activos(clase);
create index if not exists idx_activos_area on activos(area);
create index if not exists idx_activos_estado on activos(estado);
create index if not exists idx_activos_nivel_id on activos(nivel_id);
create index if not exists idx_activos_zona_id on activos(zona_id);
create index if not exists idx_activos_proveedor_id on activos(proveedor_id);
create index if not exists idx_infraestructura_area on infraestructura(area);
create index if not exists idx_infraestructura_estado on infraestructura(estado);
create index if not exists idx_infraestructura_nivel_id on infraestructura(nivel_id);
create index if not exists idx_infraestructura_proveedor_id on infraestructura(proveedor_id);
create index if not exists idx_incidencias_estado on incidencias(estado);
create index if not exists idx_incidencias_activo_id on incidencias(activo_id);
create index if not exists idx_incidencias_zona_id on incidencias(zona_id);
create index if not exists idx_incidencias_equipo_id on incidencias(equipo_id);
create index if not exists idx_incidencias_infraestructura_id on incidencias(infraestructura_id);
create unique index if not exists idx_incidencias_ticket_numero on incidencias(ticket_numero);
create index if not exists idx_mantenimientos_equipo_id on mantenimientos(equipo_id);
create index if not exists idx_mantenimientos_activo_id on mantenimientos(activo_id);
create index if not exists idx_mantenimientos_zona_id on mantenimientos(zona_id);
create index if not exists idx_mantenimientos_proveedor_id on mantenimientos(proveedor_id);
create index if not exists idx_mantenimientos_infraestructura_id on mantenimientos(infraestructura_id);
create index if not exists idx_mantenimientos_incidencia_id on mantenimientos(incidencia_id);
create index if not exists idx_mantenimientos_fecha on mantenimientos(fecha_realizacion desc);
create index if not exists idx_mapa_zonas_nivel_id on mapa_zonas(nivel_id);
create index if not exists idx_mapa_zonas_parent_id on mapa_zonas(parent_id);
create index if not exists idx_mapa_zonas_tipo on mapa_zonas(tipo);

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

drop trigger if exists set_infraestructura_updated_at on infraestructura;
create trigger set_infraestructura_updated_at
before update on infraestructura
for each row execute function set_updated_at();

drop trigger if exists set_activos_updated_at on activos;
create trigger set_activos_updated_at
before update on activos
for each row execute function set_updated_at();

drop trigger if exists set_equipos_detalle_updated_at on equipos_detalle;
create trigger set_equipos_detalle_updated_at
before update on equipos_detalle
for each row execute function set_updated_at();

drop trigger if exists set_infraestructura_detalle_updated_at on infraestructura_detalle;
create trigger set_infraestructura_detalle_updated_at
before update on infraestructura_detalle
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

drop trigger if exists set_mapa_niveles_updated_at on mapa_niveles;
create trigger set_mapa_niveles_updated_at
before update on mapa_niveles
for each row execute function set_updated_at();

-- RPC transaccional para registrar mantenimiento y actualizar equipo, infraestructura o activo.
create or replace function registrar_mantenimiento(
  p_tipo tipo_mantenimiento,
  p_descripcion text,
  p_equipo_id uuid default null,
  p_infraestructura_id uuid default null,
  p_realizado_por text default null,
  p_costo numeric default null,
  p_repuestos_notas text default null,
  p_fotos_urls text[] default '{}',
  p_fecha_realizacion date default current_date,
  p_proxima_fecha_sugerida date default null,
  p_marcar_operativo boolean default false,
  p_incidencia_id uuid default null,
  p_activo_id uuid default null,
  p_ejecucion_tipo text default 'interno',
  p_requiere_material boolean default false,
  p_proveedor_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_mantenimiento_id uuid;
  v_activo_id uuid;
  v_intervalo integer;
begin
  v_activo_id := coalesce(p_activo_id, p_equipo_id, p_infraestructura_id);

  if p_equipo_id is not null and p_infraestructura_id is not null then
    raise exception 'Selecciona equipo o infraestructura, no ambos';
  end if;

  if v_activo_id is null and p_tipo <> 'limpieza_profunda' then
    raise exception 'Selecciona un activo';
  end if;

  if p_ejecucion_tipo not in ('interno', 'externo') then
    raise exception 'Tipo de ejecución no válido';
  end if;

  if p_incidencia_id is not null then
    update incidencias
    set estado = 'en_progreso'
    where id = p_incidencia_id
      and (
        (
          p_equipo_id is not null
          and infraestructura_id is null
          and (activo_id = v_activo_id or activo_id is null)
          and (equipo_id = p_equipo_id or equipo_id is null)
        )
        or (
          p_infraestructura_id is not null
          and equipo_id is null
          and (activo_id = v_activo_id or activo_id is null)
          and (infraestructura_id = p_infraestructura_id or infraestructura_id is null)
        )
        or (
          activo_id = v_activo_id
        )
        or (
          v_activo_id is null
          and p_tipo = 'limpieza_profunda'
          and
          activo_id is null
          and equipo_id is null
          and infraestructura_id is null
        )
      );

    if not found then
      raise exception 'La incidencia no existe o no corresponde al destino seleccionado';
    end if;
  end if;

  insert into mantenimientos (
    tipo,
    activo_id,
    equipo_id,
    infraestructura_id,
    incidencia_id,
    descripcion,
    realizado_por,
    ejecucion_tipo,
    requiere_material,
    proveedor_id,
    costo,
    repuestos_notas,
    fotos_urls,
    fecha_realizacion,
    proxima_fecha_sugerida
  )
  values (
    p_tipo,
    v_activo_id,
    p_equipo_id,
    p_infraestructura_id,
    p_incidencia_id,
    p_descripcion,
    p_realizado_por,
    p_ejecucion_tipo,
    p_ejecucion_tipo = 'externo' or coalesce(p_requiere_material, false),
    case when p_ejecucion_tipo = 'externo' then p_proveedor_id else null end,
    case when p_ejecucion_tipo = 'externo' or coalesce(p_requiere_material, false) then p_costo else null end,
    p_repuestos_notas,
    coalesce(p_fotos_urls, '{}'),
    p_fecha_realizacion,
    p_proxima_fecha_sugerida
  )
  returning id into v_mantenimiento_id;

  -- Actualizar fechas según tipo
  if p_tipo = 'limpieza_profunda' then
    if v_activo_id is not null then
      select limpieza_intervalo_dias into v_intervalo
      from activos where id = v_activo_id;

      update activos
      set
        fecha_ultima_limpieza = p_fecha_realizacion,
        fecha_proxima_limpieza = case
          when v_intervalo is not null
            then p_fecha_realizacion + v_intervalo
          else null
        end
      where id = v_activo_id;

      if not found then
        raise exception 'Activo no encontrado';
      end if;
    end if;

  else
    update activos
    set
      fecha_ultima_revision = p_fecha_realizacion,
      fecha_proxima_revision = coalesce(
        p_proxima_fecha_sugerida,
        fecha_proxima_revision
      ),
      estado = case
        when p_marcar_operativo then 'operativo'
        else estado
      end
    where id = v_activo_id;

    if not found then
      raise exception 'Activo no encontrado';
    end if;
  end if;

  if p_equipo_id is not null then
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

  elsif p_infraestructura_id is not null then
    update infraestructura
    set
      fecha_ultima_revision = p_fecha_realizacion,
      fecha_proxima_revision = coalesce(
        p_proxima_fecha_sugerida,
        fecha_proxima_revision
      ),
      estado = case
        when p_marcar_operativo then 'operativo'
        else estado
      end
    where id = p_infraestructura_id;

    if not found then
      raise exception 'Infraestructura no encontrada';
    end if;
  end if;

  return v_mantenimiento_id;
end;
$$;

grant execute on function registrar_mantenimiento(
  tipo_mantenimiento,
  text,
  uuid,
  uuid,
  text,
  numeric,
  text,
  text[],
  date,
  date,
  boolean,
  uuid,
  uuid,
  text,
  boolean,
  uuid
) to authenticated;

-- ============================================================
-- COTIZACIONES
-- ============================================================
create sequence if not exists cotizacion_numero_seq;

create table if not exists cotizaciones (
  id uuid primary key default gen_random_uuid(),
  numero text not null default 'COT-' || lpad(nextval('cotizacion_numero_seq')::text, 6, '0'),
  activo_id uuid references activos(id) on delete set null,
  proveedor_id uuid references proveedores(id) on delete set null,
  incidencia_id uuid references incidencias(id) on delete set null,
  mantenimiento_id uuid references mantenimientos(id) on delete set null,
  monto numeric(12, 2),
  moneda text not null default 'MXN',
  estado text not null default 'pendiente_revision' check (
    estado in ('pendiente_revision', 'aprobada', 'rechazada')
  ),
  fecha_emision date not null default current_date,
  fecha_vencimiento date,
  archivo_url text,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_cotizaciones_updated_at on cotizaciones;
create trigger set_cotizaciones_updated_at
before update on cotizaciones
for each row execute function set_updated_at();

create index if not exists idx_cotizaciones_activo_id on cotizaciones(activo_id);

-- RLS
alter table proveedores enable row level security;
alter table equipos enable row level security;
alter table infraestructura enable row level security;
alter table activos enable row level security;
alter table equipos_detalle enable row level security;
alter table infraestructura_detalle enable row level security;
alter table incidencias enable row level security;
alter table mantenimientos enable row level security;
alter table areas enable row level security;
alter table mapa_niveles enable row level security;
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

drop policy if exists "Usuarios autenticados gestionan infraestructura" on infraestructura;
create policy "Usuarios autenticados gestionan infraestructura"
on infraestructura for all
to authenticated
using (true)
with check (true);

drop policy if exists "Usuarios autenticados gestionan activos" on activos;
create policy "Usuarios autenticados gestionan activos"
on activos for all
to authenticated
using (true)
with check (true);

drop policy if exists "Usuarios autenticados gestionan equipos_detalle" on equipos_detalle;
create policy "Usuarios autenticados gestionan equipos_detalle"
on equipos_detalle for all
to authenticated
using (true)
with check (true);

drop policy if exists "Usuarios autenticados gestionan infraestructura_detalle" on infraestructura_detalle;
create policy "Usuarios autenticados gestionan infraestructura_detalle"
on infraestructura_detalle for all
to authenticated
using (true)
with check (true);

drop policy if exists "Usuarios autenticados gestionan incidencias" on incidencias;
create policy "Usuarios autenticados gestionan incidencias"
on incidencias for all
to authenticated
using (true)
with check (true);

drop policy if exists "Anon puede reportar incidencias" on incidencias;
create policy "Anon puede reportar incidencias"
on incidencias for insert
to anon
with check (estado = 'pendiente_asignacion');

drop policy if exists "Usuarios autenticados gestionan mantenimientos" on mantenimientos;
create policy "Usuarios autenticados gestionan mantenimientos"
on mantenimientos for all
to authenticated
using (true)
with check (true);

alter table cotizaciones enable row level security;

drop policy if exists "Usuarios autenticados gestionan cotizaciones" on cotizaciones;
create policy "Usuarios autenticados gestionan cotizaciones"
on cotizaciones for all
to authenticated
using (true)
with check (true);

drop policy if exists "Usuarios autenticados gestionan areas" on areas;
create policy "Usuarios autenticados gestionan areas"
on areas for all
to authenticated
using (true)
with check (true);

drop policy if exists "Usuarios autenticados gestionan mapa_zonas" on mapa_zonas;
create policy "Usuarios autenticados gestionan mapa_zonas"
on mapa_zonas for all
to authenticated
using (true)
with check (true);

drop policy if exists "Usuarios autenticados gestionan mapa_niveles" on mapa_niveles;
create policy "Usuarios autenticados gestionan mapa_niveles"
on mapa_niveles for all
to authenticated
using (true)
with check (true);

-- STORAGE
-- Crear un bucket privado llamado "mantenimiento" en Supabase Storage.
-- Convencion de rutas:
--   equipos/{timestamp}-{archivo}
--   equipos/placas/{timestamp}-{archivo}
--   infraestructura/{timestamp}-{archivo}
--   incidencias/{timestamp}-{archivo}
--   mantenimientos/{timestamp}-{archivo}
--   cotizaciones/{timestamp}-{archivo}
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

drop policy if exists "Anon sube fotos de incidencias" on storage.objects;
create policy "Anon sube fotos de incidencias"
on storage.objects for insert
to anon
with check (
  bucket_id = 'mantenimiento'
  and (storage.foldername(name))[1] = 'incidencias'
);

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
